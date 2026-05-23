const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
  // جدول المستخدمين
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      deviceId TEXT UNIQUE NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastLogin DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // جدول الجهات
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      contactUserId TEXT NOT NULL,
      contactUsername TEXT NOT NULL,
      contactDeviceId TEXT,
      isOnline INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id),
      UNIQUE(userId, contactUserId)
    )
  `);

  // جدول الملفات المعلقة
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_files (
      id TEXT PRIMARY KEY,
      senderUserId TEXT NOT NULL,
      recipientUserId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      fileData TEXT,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      sentAt DATETIME,
      FOREIGN KEY(senderUserId) REFERENCES users(id),
      FOREIGN KEY(recipientUserId) REFERENCES users(id)
    )
  `);

  // جدول الإشعارات
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      fromUserId TEXT NOT NULL,
      toUserId TEXT NOT NULL,
      type TEXT,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(fromUserId) REFERENCES users(id),
      FOREIGN KEY(toUserId) REFERENCES users(id)
    )
  `);
});

// ─── دوال قاعدة البيانات ──────────────────────────────────────

function registerUser(username, callback) {
  const userId = uuidv4();
  const deviceId = uuidv4();
  
  db.run(
    `INSERT INTO users (id, username, deviceId) VALUES (?, ?, ?)`,
    [userId, username, deviceId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          callback({ success: false, error: 'اسم المستخدم مستخدم بالفعل' });
        } else {
          callback({ success: false, error: err.message });
        }
      } else {
        callback({ success: true, userId, deviceId, username });
      }
    }
  );
}

function getUserByDeviceId(deviceId, callback) {
  db.get(
    `SELECT * FROM users WHERE deviceId = ?`,
    [deviceId],
    callback
  );
}

function getUserByUsername(username, callback) {
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    callback
  );
}

function updateLastLogin(userId, callback) {
  db.run(
    `UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?`,
    [userId],
    callback
  );
}

function addContact(userId, contactUserId, contactUsername, callback) {
  const id = uuidv4();
  db.run(
    `INSERT OR IGNORE INTO contacts (id, userId, contactUserId, contactUsername) VALUES (?, ?, ?, ?)`,
    [id, userId, contactUserId, contactUsername],
    callback
  );
}

function getContacts(userId, callback) {
  db.all(
    `SELECT * FROM contacts WHERE userId = ? ORDER BY isOnline DESC, createdAt DESC`,
    [userId],
    callback
  );
}

function updateContactOnline(userId, contactUserId, isOnline, callback) {
  db.run(
    `UPDATE contacts SET isOnline = ? WHERE userId = ? AND contactUserId = ?`,
    [isOnline ? 1 : 0, userId, contactUserId],
    callback
  );
}

function savePendingFile(senderUserId, recipientUserId, fileName, fileSize, fileData, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO pending_files (id, senderUserId, recipientUserId, fileName, fileSize, fileData, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, senderUserId, recipientUserId, fileName, fileSize, fileData],
    callback
  );
}

function getPendingFiles(recipientUserId, callback) {
  db.all(
    `SELECT * FROM pending_files WHERE recipientUserId = ? AND status = 'pending'`,
    [recipientUserId],
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

function addNotification(fromUserId, toUserId, type, message, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO notifications (id, fromUserId, toUserId, type, message) VALUES (?, ?, ?, ?, ?)`,
    [id, fromUserId, toUserId, type, message],
    callback
  );
}

// ───────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
//  REST API Routes
// ═══════════════════════════════════════════════════════════════

// التحقق من توفر اسم المستخدم (فوري)
app.get('/api/check-username/:username', (req, res) => {
  const { username } = req.params;
  
  if (!username || username.trim().length === 0) {
    return res.status(400).json({ available: false, error: 'اسم المستخدم لا يمكن أن يكون فارغاً' });
  }
  
  getUserByUsername(username, (err, user) => {
    if (err) {
      return res.status(500).json({ available: false, error: err.message });
    }
    
    res.json({ 
      available: !user,
      username: username,
      message: user ? 'هذا الاسم مستخدم بالفعل' : 'هذا الاسم متوفر'
    });
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const devices = new Map(); // { deviceId: { socketId, userId, username } }

function getRoomId(idA, idB) {
  return [idA, idB].sort().join('::');
}

function getPartnerSocket(partnerUserId) {
  for (let [deviceId, device] of devices.entries()) {
    if (device.userId === partnerUserId) {
      return io.sockets.sockets.get(device.socketId) || null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  منطق Socket.io
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[+] اتصال جديد: ${socket.id}`);

  // ─────────────────────────────────────────────────────────────
  //  تسجيل مستخدم جديد
  // ─────────────────────────────────────────────────────────────
  socket.on('register_new_user', ({ username }, callback) => {
    registerUser(username, (result) => {
      if (result.success) {
        devices.set(result.deviceId, { 
          socketId: socket.id, 
          userId: result.userId, 
          username: result.username 
        });
        
        socket.userId = result.userId;
        socket.username = result.username;
        socket.deviceId = result.deviceId;

        console.log(`[register] مستخدم جديد: ${result.username}`);
        callback(result);

        // أخبر الجميع بأن مستخدم جديد متصل
        io.emit('user_online', {
          userId: result.userId,
          username: result.username,
          timestamp: new Date()
        });
      } else {
        callback(result);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  تسجيل دخول مستخدم موجود
  // ─────────────────────────────────────────────────────────────
  socket.on('login_user', ({ deviceId }, callback) => {
    getUserByDeviceId(deviceId, (err, user) => {
      if (err || !user) {
        callback({ success: false, error: 'معرّف الجهاز غير صحيح' });
      } else {
        devices.set(deviceId, { 
          socketId: socket.id, 
          userId: user.id, 
          username: user.username 
        });

        socket.userId = user.id;
        socket.username = user.username;
        socket.deviceId = deviceId;

        updateLastLogin(user.id, () => {
          console.log(`[login] تسجيل دخول: ${user.username}`);
          callback({ success: true, userId: user.id, username: user.username });

          // أخبر الجميع بأن المستخدم متصل
          io.emit('user_online', {
            userId: user.id,
            username: user.username,
            timestamp: new Date()
          });
        });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  التحقق من مستخدم موجود بالاسم (للمستخدمين المسجلين)
  // ─────────────────────────────────────────────────────────────
  socket.on('reconnect_user', ({ username }, callback) => {
    getUserByUsername(username, (err, user) => {
      if (err || !user) {
        callback({ success: false, error: 'هذا المستخدم غير موجود في النظام' });
      } else {
        devices.set(user.deviceId, { 
          socketId: socket.id, 
          userId: user.id, 
          username: user.username 
        });

        socket.userId = user.id;
        socket.username = user.username;
        socket.deviceId = user.deviceId;

        updateLastLogin(user.id, () => {
          console.log(`[reconnect] إعادة اتصال: ${user.username}`);
          callback({ 
            success: true, 
            userId: user.id, 
            username: user.username,
            deviceId: user.deviceId
          });

          // أخبر الجميع بأن المستخدم متصل
          io.emit('user_online', {
            userId: user.id,
            username: user.username,
            timestamp: new Date()
          });
        });
      }
    });
  });

          // أخبر الجميع
          io.emit('user_online', {
            userId: user.id,
            username: user.username,
            timestamp: new Date()
          });

          // إرسال الملفات المعلقة
          getPendingFiles(user.id, (err, pendingFiles) => {
            if (!err && pendingFiles.length > 0) {
              pendingFiles.forEach(file => {
                socket.emit('receive_pending_file', {
                  fileId: file.id,
                  senderUserId: file.senderUserId,
                  fileName: file.fileName,
                  fileSize: file.fileSize,
                  fileData: file.fileData,
                  createdAt: file.createdAt
                });
                markFileAsSent(file.id);
              });
            }
          });
        });
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  الاتصال مع مستخدم آخر
  // ─────────────────────────────────────────────────────────────
  socket.on('connect_to_user', ({ targetUsername }, callback) => {
    const myUserId = socket.userId;
    const myUsername = socket.username;

    getUserByUsername(targetUsername, (err, targetUser) => {
      if (err || !targetUser) {
        callback({ success: false, error: 'المستخدم غير موجود' });
        return;
      }

      // أضف كجهة اتصال
      addContact(myUserId, targetUser.id, targetUser.username, () => {
        addContact(targetUser.id, myUserId, myUsername, () => {
          callback({ success: true, targetUserId: targetUser.id });

          // إبحث عن socket المستخدم الآخر
          const targetSocket = getPartnerSocket(targetUser.id);
          if (targetSocket) {
            targetSocket.emit('user_added_as_contact', {
              userId: myUserId,
              username: myUsername
            });
          }
        });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  //  إرسال الملفات
  // ─────────────────────────────────────────────────────────────
  socket.on('send_file', ({ recipientUserId, fileName, fileSize, fileData }) => {
    const senderUserId = socket.userId;
    const senderUsername = socket.username;

    const recipientSocket = getPartnerSocket(recipientUserId);

    if (recipientSocket) {
      recipientSocket.emit('receive_file', {
        senderUserId,
        senderUsername,
        fileName,
        fileSize,
        fileData,
        timestamp: new Date()
      });

      socket.emit('file_sent_success', {
        recipientUserId,
        fileName,
        timestamp: new Date()
      });

      console.log(`[file] ${senderUsername} → ${recipientUserId.slice(0, 8)}…: ${fileName}`);
    } else {
      // حفظ في قائمة الانتظار
      savePendingFile(senderUserId, recipientUserId, fileName, fileSize, fileData, (err) => {
        if (err) {
          socket.emit('file_error', { error: 'فشل حفظ الملف' });
        } else {
          socket.emit('file_queued', {
            recipientUserId,
            fileName,
            status: 'في الانتظار',
            timestamp: new Date()
          });
          console.log(`[pending] ${fileName} محفوظ للمستخدم ${recipientUserId.slice(0, 8)}…`);
        }
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  قطع الاتصال
  // ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const deviceId = socket.deviceId;
    const userId = socket.userId;
    const username = socket.username;

    if (deviceId) {
      devices.delete(deviceId);
    }

    if (userId) {
      io.emit('user_offline', {
        userId,
        username,
        timestamp: new Date()
      });
      console.log(`[-] انقطع: ${username}`);
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  الحصول على قائمة الجهات
  // ─────────────────────────────────────────────────────────────
  socket.on('get_contacts', (callback) => {
    if (!socket.userId) {
      callback({ success: false, error: 'لم تسجل دخول' });
      return;
    }

    getContacts(socket.userId, (err, contacts) => {
      callback({ success: !err, contacts: contacts || [] });
    });
  });

  // ping test
  socket.on('ping_test', () => {
    socket.emit('pong_test', { time: Date.now() });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ AirRoom v2.1 يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح: http://localhost:${PORT}`);
  console.log(`📁 قاعدة البيانات: ${dbPath}`);
});
