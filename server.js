const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ═══════════════════════════════════════════════════════════════
//  قاعدة البيانات SQLite
// ═══════════════════════════════════════════════════════════════

const dbPath = path.join(__dirname, 'airroom.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ خطأ في قاعدة البيانات:', err);
  else console.log('✅ قاعدة البيانات جاهزة');
});

// إنشاء الجداول
db.serialize(() => {
  // جدول الجهات
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      deviceId TEXT UNIQUE NOT NULL,
      lastSeen DATETIME,
      isOnline INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // جدول الملفات المعلقة
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_files (
      id TEXT PRIMARY KEY,
      senderDeviceId TEXT NOT NULL,
      recipientDeviceId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      fileData TEXT,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      sentAt DATETIME
    )
  `);

  // جدول الرسائل والإشعارات
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      fromDeviceId TEXT NOT NULL,
      toDeviceId TEXT NOT NULL,
      type TEXT,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ─── دوال قاعدة البيانات ──────────────────────────────────────

function addContact(deviceId, name, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO contacts (id, name, deviceId) VALUES (?, ?, ?)`,
    [id, name, deviceId],
    callback
  );
}

function getContacts(callback) {
  db.all(
    `SELECT * FROM contacts ORDER BY lastSeen DESC`,
    callback
  );
}

function updateContactOnline(deviceId, isOnline, callback) {
  db.run(
    `UPDATE contacts SET isOnline = ?, lastSeen = CURRENT_TIMESTAMP WHERE deviceId = ?`,
    [isOnline ? 1 : 0, deviceId],
    callback
  );
}

function savePendingFile(senderDeviceId, recipientDeviceId, fileName, fileSize, fileData, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO pending_files (id, senderDeviceId, recipientDeviceId, fileName, fileSize, fileData, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, senderDeviceId, recipientDeviceId, fileName, fileSize, fileData],
    callback
  );
}

function getPendingFiles(recipientDeviceId, callback) {
  db.all(
    `SELECT * FROM pending_files WHERE recipientDeviceId = ? AND status = 'pending'`,
    [recipientDeviceId],
    callback
  );
}

function markFileAsSent(fileId, callback) {
  db.run(
    `UPDATE pending_files SET status = 'sent', sentAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [fileId],
    callback
  );
}

function addNotification(fromDeviceId, toDeviceId, type, message, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO notifications (id, fromDeviceId, toDeviceId, type, message) VALUES (?, ?, ?, ?, ?)`,
    [id, fromDeviceId, toDeviceId, type, message],
    callback
  );
}

function getNotifications(deviceId, callback) {
  db.all(
    `SELECT * FROM notifications WHERE toDeviceId = ? AND isRead = 0 ORDER BY createdAt DESC`,
    [deviceId],
    callback
  );
}

// ───────────────────────────────────────────────────────────────

// تقديم ملفات المجلد العام
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  خريطة الأجهزة المتصلة حالياً
// ═══════════════════════════════════════════════════════════════
const devices = new Map();

function getRoomId(idA, idB) {
  return [idA, idB].sort().join('::');
}

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
  //  تسجيل الجهاز
  // ─────────────────────────────────────────────────────────────
  socket.on('register_device', ({ myId, myName, pairedId }) => {
    if (!myId) return;

    devices.set(myId, { socketId: socket.id, pairedId: pairedId || null, name: myName || '؟' });
    socket.deviceId = myId;
    socket.deviceName = myName;

    console.log(`[register] ${myName} (${myId.slice(0, 8)}…)`);

    socket.emit('registered', { myId, myName });

    // ─────────────────────────────────────────────────────────────
    // تحديث حالة الاتصال في قاعدة البيانات
    // ─────────────────────────────────────────────────────────────
    updateContactOnline(myId, true, () => {
      // أخبر جميع الأجهزة الأخرى بأن هذا الجهاز متصل
      socket.broadcast.emit('contact_online', {
        deviceId: myId,
        name: myName,
        timestamp: new Date()
      });

      // ─────────────────────────────────────────────────────────────
      // إرسال الملفات المعلقة تلقائياً
      // ─────────────────────────────────────────────────────────────
      getPendingFiles(myId, (err, pendingFiles) => {
        if (!err && pendingFiles.length > 0) {
          console.log(`[pending] ${pendingFiles.length} ملفات معلقة للجهاز ${myId.slice(0, 8)}…`);
          
          pendingFiles.forEach(file => {
            socket.emit('receive_pending_file', {
              fileId: file.id,
              senderDeviceId: file.senderDeviceId,
              fileName: file.fileName,
              fileSize: file.fileSize,
              fileData: file.fileData,
              createdAt: file.createdAt
            });

            // أخبر المُرسل الأصلي بأن الملف تم استقباله
            const senderSocket = getPartnerSocket(file.senderDeviceId);
            if (senderSocket) {
              senderSocket.emit('file_delivered', {
                fileId: file.id,
                recipientDeviceId: myId,
                fileName: file.fileName,
                timestamp: new Date()
              });
            }

            // علّم الملف كمرسل
            markFileAsSent(file.id);
          });
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // الاتصال مع شريك مقترن
    // ─────────────────────────────────────────────────────────────
    if (!pairedId) return;

    const partnerSocket = getPartnerSocket(pairedId);
    const partnerInfo = devices.get(pairedId);

    if (partnerSocket && partnerInfo) {
      const roomId = getRoomId(myId, pairedId);
      socket.join(roomId);
      partnerSocket.join(roomId);

      console.log(`[room] غرفة مشتركة: ${roomId.slice(0, 20)}…`);

      socket.emit('partner_online', {
        partnerId: pairedId,
        partnerName: partnerInfo.name,
        roomId,
      });

      partnerSocket.emit('partner_online', {
        partnerId: myId,
        partnerName: myName,
        roomId,
      });
    } else {
      socket.emit('partner_offline', { partnerId: pairedId });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  إدارة الجهات (Contacts)
  // ─────────────────────────────────────────────────────────────

  socket.on('save_contact', ({ contactDeviceId, contactName }, callback) => {
    const myId = socket.deviceId;
    
    // تحقق إذا كان الجهاز موجود في الجهات
    db.get(
      `SELECT * FROM contacts WHERE deviceId = ?`,
      [contactDeviceId],
      (err, row) => {
        if (err) {
          callback({ success: false, error: err.message });
          return;
        }

        if (row) {
          // تحديث الاسم إذا كان موجود
          db.run(
            `UPDATE contacts SET name = ? WHERE deviceId = ?`,
            [contactName, contactDeviceId],
            (err) => {
              callback({ success: !err, contactId: row.id });
            }
          );
        } else {
          // إضافة جهة اتصال جديدة
          addContact(contactDeviceId, contactName, (err) => {
            callback({ success: !err });
          });
        }
      }
    );
  });

  socket.on('get_contacts', (callback) => {
    getContacts((err, contacts) => {
      if (err) {
        callback({ success: false, error: err.message });
      } else {
        callback({ success: true, contacts: contacts || [] });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  إرسال الملفات مع الحفظ عند الانقطاع
  // ─────────────────────────────────────────────────────────────

  socket.on('send_file', ({ recipientDeviceId, fileName, fileSize, fileData, roomId }) => {
    const senderDeviceId = socket.deviceId;
    const senderName = socket.deviceName;

    const recipientSocket = getPartnerSocket(recipientDeviceId);

    if (recipientSocket) {
      // الجهاز متصل — أرسل مباشرة
      recipientSocket.emit('receive_file', {
        senderDeviceId,
        senderName,
        fileName,
        fileSize,
        fileData,
        timestamp: new Date()
      });

      // أخبر المُرسل بالنجاح
      socket.emit('file_sent_success', {
        recipientDeviceId,
        fileName,
        timestamp: new Date()
      });

      // أضف إشعار
      addNotification(senderDeviceId, recipientDeviceId, 'file_received', 
        `استقبل ${senderName} الملف "${fileName}"`);

      console.log(`[file] ${senderName} → ${recipientDeviceId.slice(0, 8)}…: ${fileName}`);

    } else {
      // الجهاز غير متصل — احفظ في قائمة الانتظار
      savePendingFile(senderDeviceId, recipientDeviceId, fileName, fileSize, fileData, (err) => {
        if (err) {
          socket.emit('file_error', { error: 'فشل حفظ الملف' });
        } else {
          socket.emit('file_queued', {
            recipientDeviceId,
            fileName,
            status: 'في الانتظار',
            message: 'سيتم إرسال الملف عند الاتصال',
            timestamp: new Date()
          });

          // أضف إشعار
          addNotification(senderDeviceId, recipientDeviceId, 'file_pending',
            `الملف "${fileName}" في الانتظار...`);

          console.log(`[pending] ${fileName} محفوظ في الانتظار للجهاز ${recipientDeviceId.slice(0, 8)}…`);
        }
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  نقل أجزاء الملف (للملفات الكبيرة)
  // ─────────────────────────────────────────────────────────────

  socket.on('send_chunk', ({ roomId, name, type, size, total, index, data }) => {
    if (!roomId) return;
    socket.to(roomId).emit('receive_chunk', { name, type, size, total, index, data });
  });

  // ─────────────────────────────────────────────────────────────
  //  قطع الاتصال
  // ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const deviceId = socket.deviceId;
    const deviceName = socket.deviceName;
    
    if (!deviceId) return;

    devices.delete(deviceId);

    // تحديث قاعدة البيانات
    updateContactOnline(deviceId, false, () => {
      // أخبر جميع الأجهزة الأخرى
      io.emit('contact_offline', {
        deviceId: deviceId,
        name: deviceName,
        timestamp: new Date()
      });

      console.log(`[-] انقطع: ${deviceName} (${deviceId.slice(0, 8)}…)`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  ping للاختبار
  // ─────────────────────────────────────────────────────────────

  socket.on('ping_test', () => {
    socket.emit('pong_test', { time: Date.now(), socketId: socket.id });
  });
});

// ─── تشغيل الخادم ─────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ AirRoom v2.0 يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح: http://localhost:${PORT}`);
  console.log(`📁 قاعدة البيانات: ${dbPath}`);
});
