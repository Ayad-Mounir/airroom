// ═══════════════════════════════════════════════════════════════
//  AirRoom — app.js
//  المرحلة 2: نظام الهوية والاقتران الدائم
// ═══════════════════════════════════════════════════════════════

// ─── 1. توليد UUID فريد ───────────────────────────────────────
function generateUUID() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback للمتصفحات القديمة
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── 2. كشف نوع الجهاز بناءً على الشاشة والـ User Agent ──────
function detectDeviceName() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile =
    /android|iphone|ipad|ipod|blackberry|windows phone|mobile/.test(ua) ||
    window.screen.width <= 768;

  if (/ipad|tablet/.test(ua) || (window.screen.width > 600 && isMobile)) {
    return '📱 جهاز لوحي';
  }
  if (isMobile) {
    return '📱 هاتف';
  }
  return '💻 حاسوب';
}

// ─── 3. تهيئة هوية الجهاز (يُنفَّذ مرة واحدة فقط) ────────────
function initIdentity() {
  let myId = localStorage.getItem('airroom_my_id');
  let myName = localStorage.getItem('airroom_my_name');

  if (!myId) {
    myId = generateUUID();
    localStorage.setItem('airroom_my_id', myId);
    console.log('[AirRoom] هوية جديدة:', myId);
  } else {
    console.log('[AirRoom] هوية موجودة:', myId);
  }

  if (!myName) {
    myName = detectDeviceName();
    localStorage.setItem('airroom_my_name', myName);
    console.log('[AirRoom] اسم الجهاز:', myName);
  }

  return { myId, myName };
}

// ─── 4. معالجة رابط الاقتران (?pairWith=XXX) ─────────────────
function processPairingURL() {
  const params = new URLSearchParams(window.location.search);
  const pairWith = params.get('pairWith');

  if (pairWith && pairWith.trim() !== '') {
    const existing = localStorage.getItem('airroom_paired_id');

    if (existing !== pairWith) {
      localStorage.setItem('airroom_paired_id', pairWith);
      console.log('[AirRoom] اقتران جديد مع:', pairWith);
    } else {
      console.log('[AirRoom] اقتران موجود مسبقاً مع:', pairWith);
    }

    // تنظيف الرابط بدون إعادة تحميل الصفحة
    const cleanURL = window.location.pathname;
    history.replaceState(null, '', cleanURL);
    console.log('[AirRoom] تم تنظيف الرابط');

    return pairWith;
  }

  return localStorage.getItem('airroom_paired_id') || null;
}

// ─── 5. توليد رابط الاقتران للمشاركة ──────────────────────────
function generateShareLink(myId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?pairWith=${myId}`;
}

// ─── 6. نسخ الرابط للحافظة (Fallback) ──────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback قديم
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

// ─── 7. مشاركة رابط الغرفة (Web Share API) ───────────────────
async function shareRoom(myId, myName) {
  const link = generateShareLink(myId);
  const shareData = {
    title: 'AirRoom — مشاركة الملفات',
    text: `انضم إلى غرفتي على AirRoom لمشاركة الملفات فوراً 🚀`,
    url: link,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      console.log('[AirRoom] تمت المشاركة عبر Web Share API');
      return 'shared';
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[AirRoom] Web Share API فشلت، الرجوع للنسخ:', err);
      } else {
        return 'cancelled';
      }
    }
  }

  // Fallback: نسخ الرابط
  const copied = await copyToClipboard(link);
  console.log('[AirRoom] تم نسخ الرابط:', link);
  return copied ? 'copied' : 'failed';
}

// ─── 8. تحديث واجهة المستخدم ──────────────────────────────────
function updateUI(state) {
  const { myId, myName, pairedId } = state;

  const elMyName = document.getElementById('my-device-name');
  const elMyId = document.getElementById('my-device-id');
  const elPairedId = document.getElementById('paired-device-id');
  const elPairedStatus = document.getElementById('paired-status');

  if (elMyName) elMyName.textContent = myName;
  if (elMyId) elMyId.textContent = myId.slice(0, 8) + '…';

  if (pairedId) {
    if (elPairedId) elPairedId.textContent = pairedId.slice(0, 8) + '…';
    if (elPairedStatus) elPairedStatus.textContent = 'مقترن — في انتظار الاتصال';
  } else {
    if (elPairedId) elPairedId.textContent = 'لا يوجد';
    if (elPairedStatus) elPairedStatus.textContent = 'غير مقترن — شارك الرابط لتبدأ';
  }
}

// ─── 9. نقطة الدخول الرئيسية ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('[AirRoom] بدء التهيئة…');

  const { myId, myName } = initIdentity();
  const pairedId = processPairingURL();

  const state = { myId, myName, pairedId };
  console.log('[AirRoom] الحالة الحالية:', {
    myId: myId.slice(0, 8) + '…',
    myName,
    pairedId: pairedId ? pairedId.slice(0, 8) + '…' : 'لا يوجد',
  });

  updateUI(state);

  // ربط زر المشاركة
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const result = await shareRoom(myId, myName);

      const feedback = document.getElementById('share-feedback');
      if (!feedback) return;

      if (result === 'shared') {
        feedback.textContent = '✅ تمت المشاركة';
      } else if (result === 'copied') {
        feedback.textContent = '📋 تم نسخ الرابط!';
      } else if (result === 'cancelled') {
        feedback.textContent = '';
      } else {
        feedback.textContent = '❌ تعذّرت المشاركة';
      }

      if (result !== 'cancelled') {
        setTimeout(() => { feedback.textContent = ''; }, 3000);
      }
    });
  }

  // تصدير الحالة للمراحل القادمة
  window.AirRoom = { state, shareRoom, generateShareLink };
  console.log('[AirRoom] التهيئة اكتملت ✅');
});

// ═══════════════════════════════════════════════════════════════
//  المرحلة 3 — اتصال Socket.io ومنطق الغرف
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // نضمن تشغيل هذا الكود بعد initIdentity في الـ DOMContentLoaded الأول
  // لذا نستخدم setTimeout صفري لنضعه في نهاية قائمة الانتظار
  setTimeout(() => {
    const { state } = window.AirRoom;
    if (!state) return;

    const socket = io();
    window.AirRoom.socket = socket;

    // ── عند الاتصال، سجّل الجهاز فوراً ──────────────────────
    socket.on('connect', () => {
      console.log('[Socket] متصل بالخادم:', socket.id);
      socket.emit('register_device', {
        myId:     state.myId,
        myName:   state.myName,
        pairedId: state.pairedId,
      });
    });

    // ── تأكيد التسجيل ────────────────────────────────────────
    socket.on('registered', ({ myId, myName }) => {
      console.log('[Socket] مسجّل:', myName);
    });

    // ── الشريك متصل الآن ─────────────────────────────────────
    socket.on('partner_online', ({ partnerId, partnerName, roomId }) => {
      console.log('[Socket] الشريك متصل:', partnerName);
      state.roomId      = roomId;
      state.partnerName = partnerName;
      setStatus('online', partnerName);
      // تحديث اسم الشريك في بطاقة الجهاز
      const elPaired = document.getElementById('paired-device-id');
      if (elPaired) elPaired.textContent = partnerName;
      const elStatus = document.getElementById('paired-status');
      if (elStatus) elStatus.textContent = 'متصل الآن 🟢';
      // طلب إذن الإشعارات عند أول اتصال ناجح
      requestNotificationPermission();
    });

    // ── الشريك غير متصل ──────────────────────────────────────
    socket.on('partner_offline', ({ partnerId }) => {
      console.log('[Socket] الشريك غير متصل:', partnerId?.slice(0,8));
      state.roomId      = null;
      state.partnerName = null;
      setStatus('offline', null);
      // إعادة عرض UUID المقطوع في البطاقة
      const elPaired = document.getElementById('paired-device-id');
      if (elPaired) elPaired.textContent = partnerId ? partnerId.slice(0,8) + '…' : 'لا يوجد';
      const elStatus = document.getElementById('paired-status');
      if (elStatus) elStatus.textContent = 'غير متصل حالياً 🔴';
    });

    socket.on('disconnect', () => {
      console.log('[Socket] انقطع الاتصال بالخادم');
      setStatus('disconnected', null);
    });
  }, 0);
});

// ─── تحديث مؤشر الحالة في الواجهة ──────────────────────────
function setStatus(status, partnerName) {
  const el = document.getElementById('connection-status');
  if (!el) return;

  if (status === 'online') {
    el.innerHTML = `🟢 متصل مع <strong>${partnerName}</strong>`;
    el.className = 'status online';
  } else if (status === 'offline') {
    el.textContent = '🔴 الشريك غير متصل حالياً';
    el.className = 'status offline';
  } else {
    el.textContent = '⚪ منقطع عن الخادم';
    el.className = 'status disconnected';
  }
}

// ═══════════════════════════════════════════════════════════════
//  المرحلة 4 — نقل الملفات (Smart Chunking)
// ═══════════════════════════════════════════════════════════════

const CHUNK_SIZE = 256 * 1024; // رُفِّع من 64KB → 256KB لتسريع نقل الملفات الكبيرة

// ─── مخزن الأجزاء المستقبَلة: Map<fileName, { chunks[], total, type, size }> ──
const incomingFiles = new Map();

// ─── 1. إرسال ملف مجزّأ ────────────────────────────────────────
function sendFile(file) {
  const { state } = window.AirRoom;

  if (!state.roomId) {
    showTransferError('لا يوجد اتصال نشط — تأكد من اتصال شريكك أولاً');
    return;
  }

  const socket   = window.AirRoom.socket;
  const total    = Math.ceil(file.size / CHUNK_SIZE);
  let   index    = 0;

  console.log(`[send] بدء إرسال: ${file.name} | ${(file.size/1024/1024).toFixed(2)} MB | ${total} جزء`);
  showSendProgress(0, file.name);

  // قراءة جزء واحد في كل مرة بشكل تسلسلي
  function readNextChunk() {
    const start  = index * CHUNK_SIZE;
    const end    = Math.min(start + CHUNK_SIZE, file.size);
    const blob   = file.slice(start, end);
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target.result; // ArrayBuffer

      socket.emit('send_chunk', {
        roomId: state.roomId,
        name:   file.name,
        type:   file.type || 'application/octet-stream',
        size:   file.size,
        total,
        index,
        data,
      });

      const pct = Math.round(((index + 1) / total) * 100);
      showSendProgress(pct, file.name);

      index++;
      if (index < total) {
        // نضيف تأخيراً صغيراً لمنع تشبّع الـ socket buffer
        setTimeout(readNextChunk, 0);
      } else {
        console.log(`[send] اكتمل إرسال: ${file.name}`);
        addTransferLog('sent', file.name, file.size);
        setTimeout(() => showSendProgress(-1, file.name), 1500);
      }
    };

    reader.onerror = () => {
      showTransferError(`خطأ في قراءة الملف: ${file.name}`);
    };

    reader.readAsArrayBuffer(blob);
  }

  readNextChunk();
}

// ─── 2. استقبال الأجزاء وتجميعها ────────────────────────────
function initChunkReceiver() {
  const socket = window.AirRoom.socket;

  socket.on('receive_chunk', ({ name, type, size, total, index, data }) => {
    // تهيئة مدخل جديد عند أول جزء
    if (!incomingFiles.has(name)) {
      incomingFiles.set(name, { chunks: new Array(total), total, type, size, received: 0 });
      console.log(`[recv] بدء استقبال: ${name} | ${total} جزء`);
    }

    const entry = incomingFiles.get(name);
    entry.chunks[index] = data;
    entry.received++;

    const pct = Math.round((entry.received / total) * 100);
    showReceiveProgress(pct, name);

    // اكتمل الاستقبال
    if (entry.received === total) {
      console.log(`[recv] اكتمل استقبال: ${name}`);
      assembleAndDownload(name, entry);
      incomingFiles.delete(name); // تحرير الذاكرة
    }
  });
}

// ─── 3. تجميع الأجزاء وبدء التحميل التلقائي ────────────────
function assembleAndDownload(name, entry) {
  const blob = new Blob(entry.chunks, { type: entry.type });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // تنظيف الذاكرة بعد لحظة
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1000);

  addTransferLog('received', name, entry.size);
  setTimeout(() => showReceiveProgress(-1, name), 1500);

  // إشعار المستخدم إذا كان في تبويب آخر
  notifyFileReceived(name, entry.size);
}

// ─── Web Notification عند استقبال ملف ───────────────────────
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notifyFileReceived(fileName, size) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // أرسل الإشعار فقط إذا كان التطبيق في الخلفية
  if (document.visibilityState === 'visible') return;

  const sizeStr = size > 1024 * 1024
    ? (size / 1024 / 1024).toFixed(2) + ' MB'
    : (size / 1024).toFixed(1) + ' KB';

  new Notification('📥 AirRoom — ملف مستقبَل', {
    body: `${fileName}  (${sizeStr})`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'airroom-file',
  });
}

// ─── 4. تحديثات الواجهة ─────────────────────────────────────

function showSendProgress(pct, fileName) {
  const bar   = document.getElementById('send-progress-bar');
  const label = document.getElementById('send-progress-label');
  const wrap  = document.getElementById('send-progress-wrap');
  if (!bar || !label || !wrap) return;

  if (pct < 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  bar.style.width    = pct + '%';
  label.textContent  = pct < 100
    ? `📤 إرسال ${fileName} — ${pct}%`
    : `✅ اكتمل إرسال ${fileName}`;
}

function showReceiveProgress(pct, fileName) {
  const bar   = document.getElementById('recv-progress-bar');
  const label = document.getElementById('recv-progress-label');
  const wrap  = document.getElementById('recv-progress-wrap');
  if (!bar || !label || !wrap) return;

  if (pct < 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  bar.style.width    = pct + '%';
  label.textContent  = pct < 100
    ? `📥 استقبال ${fileName} — ${pct}%`
    : `✅ اكتمل استقبال ${fileName}`;
}

function showTransferError(msg) {
  const el = document.getElementById('transfer-error');
  if (!el) return;
  el.textContent = '⚠️ ' + msg;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

function addTransferLog(direction, fileName, size) {
  const list = document.getElementById('transfer-log');
  if (!list) return;

  const icon = direction === 'sent' ? '📤' : '📥';
  const sizeStr = size > 1024 * 1024
    ? (size / 1024 / 1024).toFixed(2) + ' MB'
    : (size / 1024).toFixed(1) + ' KB';

  const li = document.createElement('li');
  li.textContent = `${icon} ${fileName} — ${sizeStr}`;
  list.prepend(li);

  // الاحتفاظ بآخر 10 عمليات فقط
  while (list.children.length > 10) {
    list.removeChild(list.lastChild);
  }
}

// ─── 5. ربط منطقة Drag & Drop وزر اختيار الملف ─────────────
function initDropZone() {
  const zone      = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  if (!zone) return;

  // سحب وإفلات
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) sendFile(files[0]);
  });

  // نقرة على المنطقة
  zone.addEventListener('click', () => fileInput && fileInput.click());

  // اختيار ملف عبر input
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        sendFile(fileInput.files[0]);
        fileInput.value = ''; // إعادة تهيئة للسماح بإعادة اختيار نفس الملف
      }
    });
  }
}

// ─── 6. تهيئة المرحلة 4 بعد جهوزية Socket ──────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initDropZone();
    // نبدأ مستمع الاستقبال بعد أن يكون socket جاهزاً
    const waitForSocket = setInterval(() => {
      if (window.AirRoom?.socket) {
        clearInterval(waitForSocket);
        initChunkReceiver();
        console.log('[AirRoom] مستمع نقل الملفات جاهز ✅');
      }
    }, 100);
  }, 0);
});
