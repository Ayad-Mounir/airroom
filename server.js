const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── تقديم ملفات المجلد العام ─────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  خريطة الأجهزة المتصلة
//  devices: Map<deviceId, { socketId, pairedId, name }>
// ═══════════════════════════════════════════════════════════════
const devices = new Map();

// ─── توليد معرّف الغرفة المشتركة بين جهازين ──────────────────
// نرتّب المعرّفَين أبجدياً حتى يكون المعرّف دائماً متطابقاً
// بغض النظر عن أيّهما بدأ الاتصال أولاً
function getRoomId(idA, idB) {
  return [idA, idB].sort().join('::');
}

// ─── البحث عن socket الشريك المقترن ──────────────────────────
function getPartnerSocket(pairedId) {
  const partner = devices.get(pairedId);
  if (!partner) return null;
  return io.sockets.sockets.get(partner.socketId) || null;
}

// ═══════════════════════════════════════════════════════════════
//  منطق Socket.io
// ═══════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  console.log(`[+] اتصال جديد: ${socket.id}`);

  // ─────────────────────────────────────────────────────────────
  //  حدث التسجيل — يُرسَل فور اتصال العميل
  //  payload: { myId, myName, pairedId }
  // ─────────────────────────────────────────────────────────────
  socket.on('register_device', ({ myId, myName, pairedId }) => {
    if (!myId) return;

    // حفظ بيانات الجهاز في الخريطة
    devices.set(myId, { socketId: socket.id, pairedId: pairedId || null, name: myName || '؟' });
    // ربط معرّف الجهاز بالـ socket للرجوع إليه عند قطع الاتصال
    socket.deviceId = myId;

    console.log(`[register] ${myName} (${myId.slice(0,8)}…) | شريك: ${pairedId ? pairedId.slice(0,8)+'…' : 'لا يوجد'}`);

    // ── إخبار الجهاز بحالته الحالية ────────────────────────────
    socket.emit('registered', { myId, myName });

    // ── إذا كان هناك شريك مقترن، تحقّق هل هو متصل الآن ────────
    if (!pairedId) return;

    const partnerSocket = getPartnerSocket(pairedId);
    const partnerInfo   = devices.get(pairedId);

    if (partnerSocket && partnerInfo) {
      // الشريكان متصلان — أنشئ غرفة مشتركة
      const roomId = getRoomId(myId, pairedId);

      socket.join(roomId);
      partnerSocket.join(roomId);

      console.log(`[room] غرفة مشتركة: ${roomId.slice(0,20)}…`);

      // أخبر كل طرف بأن الآخر متصل الآن
      socket.emit('partner_online', {
        partnerId:   pairedId,
        partnerName: partnerInfo.name,
        roomId,
      });

      partnerSocket.emit('partner_online', {
        partnerId:   myId,
        partnerName: myName,
        roomId,
      });

    } else {
      // الشريك غير متصل بعد
      socket.emit('partner_offline', { partnerId: pairedId });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  قطع الاتصال — إخبار الشريك فوراً
  // ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const deviceId = socket.deviceId;
    if (!deviceId) return;

    const info = devices.get(deviceId);
    console.log(`[-] انقطع: ${info?.name || '؟'} (${deviceId.slice(0,8)}…)`);

    // إزالة الجهاز من الخريطة
    devices.delete(deviceId);

    // إخبار الشريك إذا كان متصلاً
    if (info?.pairedId) {
      const partnerSocket = getPartnerSocket(info.pairedId);
      if (partnerSocket) {
        partnerSocket.emit('partner_offline', { partnerId: deviceId });
        console.log(`[offline] أُخبر الشريك بانقطاع ${deviceId.slice(0,8)}…`);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  تمرير أجزاء الملف إلى الغرفة المشتركة (relay — بدون تخزين)
  //  payload: { roomId, name, type, size, total, index, data }
  // ─────────────────────────────────────────────────────────────
  socket.on('send_chunk', ({ roomId, name, type, size, total, index, data }) => {
    if (!roomId) return;
    socket.to(roomId).emit('receive_chunk', { name, type, size, total, index, data });
  });

  // ─────────────────────────────────────────────────────────────
  //  ping بسيط للتحقق (يُحتفظ به للاختبار)
  // ─────────────────────────────────────────────────────────────
  socket.on('ping_test', () => {
    socket.emit('pong_test', { time: Date.now(), socketId: socket.id });
  });
});

// ─── تشغيل الخادم ─────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ AirRoom يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح: http://localhost:${PORT}`);
});