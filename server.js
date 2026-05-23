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

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'airroom.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ خطأ في قاعدة البيانات:', err);
  else console.log('✅ قاعدة البيانات جاهزة:', dbPath);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    deviceId TEXT UNIQUE NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    contactUserId TEXT NOT NULL,
    contactUsername TEXT NOT NULL,
    isOnline INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    UNIQUE(userId, contactUserId)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pending_files (
    id TEXT PRIMARY KEY,
    senderUserId TEXT NOT NULL,
    senderUsername TEXT NOT NULL,
    recipientUserId TEXT NOT NULL,
    fileName TEXT NOT NULL,
    fileSize INTEGER NOT NULL,
    fileData BLOB,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    sentAt DATETIME
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    fromUserId TEXT NOT NULL,
    toUserId TEXT NOT NULL,
    type TEXT,
    message TEXT,
    isRead INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
  db.get(`SELECT * FROM users WHERE deviceId = ?`, [deviceId], callback);
}

function getUserByUsername(username, callback) {
  db.get(`SELECT * FROM users WHERE username = ?`, [username], callback);
}

function updateLastLogin(userId, callback) {
  db.run(`UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?`, [userId], callback || (() => {}));
}

function addContact(userId, contactUserId, contactUsername, callback) {
  const id = uuidv4();
  db.run(
    `INSERT OR IGNORE INTO contacts (id, userId, contactUserId, contactUsername) VALUES (?, ?, ?, ?)`,
    [id, userId, contactUserId, contactUsername],
    callback || (() => {})
  );
}

function getContacts(userId, callback) {
  db.all(
    `SELECT * FROM contacts WHERE userId = ? ORDER BY isOnline DESC, createdAt DESC`,
    [userId],
    callback
  );
}

function updateContactOnlineStatus(userId, contactUserId, isOnline) {
  db.run(
    `UPDATE contacts SET isOnline = ? WHERE userId = ? AND contactUserId = ?`,
    [isOnline ? 1 : 0, userId, contactUserId]
  );
}

function savePendingFile(senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData, callback) {
  const id = uuidv4();
  db.run(
    `INSERT INTO pending_files (id, senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [id, senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData],
    callback || (() => {})
  );
}

function getPendingFiles(recipientUserId, callback) {
  db.all(
    `SELECT * FROM pending_files WHERE recipientUserId = ? AND status = 'pending' ORDER BY createdAt ASC`,
    [recipientUserId],
    callback
  );
}

function markFileAsSent(fileId) {
  db.run(`UPDATE pending_files SET status = 'sent', sentAt = CURRENT_TIMESTAMP WHERE id = ?`, [fileId]);
}

// ═══════════════════════════════════════════════════════════════
//  REST API
// ═══════════════════════════════════════════════════════════════

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/check-username/:username', (req, res) => {
  const { username } = req.params;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ available: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
  }
  getUserByUsername(username.trim(), (err, user) => {
    if (err) return res.status(500).json({ available: false, error: err.message });
    res.json({
      available: !user,
      message: user ? 'هذا الاسم مستخدم بالفعل' : 'هذا الاسم متوفر'
    });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  Socket.io — خريطة المستخدمين المتصلين
//  { userId: { socketId, username, deviceId } }
// ═══════════════════════════════════════════════════════════════

const onlineUsers = new Map();

function getSocketByUserId(userId) {
  const entry = onlineUsers.get(userId);
  if (!entry) return null;
  return io.sockets.sockets.get(entry.socketId) || null;
}

function registerSocketUser(socket, userId, username, deviceId) {
  onlineUsers.set(userId, { socketId: socket.id, username, deviceId });
  socket.userId   = userId;
  socket.username = username;
  socket.deviceId = deviceId;
}

// ─── إرسال الملفات المعلقة عند دخول المستخدم ─────────────────

function deliverPendingFiles(socket, userId) {
  getPendingFiles(userId, (err, files) => {
    if (err || !files || files.length === 0) return;
    files.forEach(file => {
      socket.emit('receive_pending_file', {
        fileId:        file.id,
        senderUserId:  file.senderUserId,
        senderUsername: file.senderUsername,
        fileName:      file.fileName,
        fileSize:      file.fileSize,
        fileData:      file.fileData,
        createdAt:     file.createdAt
      });
      markFileAsSent(file.id);
      console.log(`[pending→delivered] ${file.fileName} → ${socket.username}`);
    });
  });
}

// ─── إشعار جهات اتصال المستخدم بحالته ───────────────────────

function notifyContacts(userId, username, isOnline) {
  getContacts(userId, (err, contacts) => {
    if (err || !contacts) return;
    contacts.forEach(contact => {
      updateContactOnlineStatus(contact.contactUserId, userId, isOnline);
      const s = getSocketByUserId(contact.contactUserId);
      if (s) {
        s.emit(isOnline ? 'contact_online' : 'contact_offline', { userId, username });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  منطق Socket.io
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[+] اتصال جديد: ${socket.id}`);

  // ─── تسجيل مستخدم جديد ────────────────────────────────────
  socket.on('register_new_user', ({ username }, callback) => {
    if (!username || username.trim().length < 3) {
      return callback({ success: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    }
    registerUser(username.trim(), (result) => {
      if (!result.success) return callback(result);

      registerSocketUser(socket, result.userId, result.username, result.deviceId);
      console.log(`[register] مستخدم جديد: ${result.username}`);
      callback(result);

      notifyContacts(result.userId, result.username, true);
    });
  });

  // ─── تسجيل دخول بالـ deviceId ─────────────────────────────
  socket.on('login_user', ({ deviceId }, callback) => {
    getUserByDeviceId(deviceId, (err, user) => {
      if (err || !user) return callback({ success: false, error: 'معرّف الجهاز غير صحيح' });

      registerSocketUser(socket, user.id, user.username, deviceId);
      updateLastLogin(user.id);
      console.log(`[login] تسجيل دخول: ${user.username}`);
      callback({ success: true, userId: user.id, username: user.username, deviceId });

      notifyContacts(user.id, user.username, true);
      deliverPendingFiles(socket, user.id);
    });
  });

  // ─── إعادة اتصال بالاسم ────────────────────────────────────
  socket.on('reconnect_user', ({ username }, callback) => {
    if (!username) return callback({ success: false, error: 'الاسم مطلوب' });

    getUserByUsername(username.trim(), (err, user) => {
      if (err || !user) return callback({ success: false, error: 'المستخدم غير موجود في النظام' });

      registerSocketUser(socket, user.id, user.username, user.deviceId);
      updateLastLogin(user.id);
      console.log(`[reconnect] إعادة اتصال: ${user.username}`);
      callback({ success: true, userId: user.id, username: user.username, deviceId: user.deviceId });

      notifyContacts(user.id, user.username, true);
      deliverPendingFiles(socket, user.id);
    });
  });

  // ─── الاتصال بمستخدم آخر ──────────────────────────────────
  socket.on('connect_to_user', ({ targetUsername }, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'لم تسجل دخول' });

    getUserByUsername(targetUsername, (err, targetUser) => {
      if (err || !targetUser) return callback({ success: false, error: 'المستخدم غير موجود' });
      if (targetUser.id === socket.userId) return callback({ success: false, error: 'لا يمكنك إضافة نفسك' });

      addContact(socket.userId, targetUser.id, targetUser.username, () => {
        addContact(targetUser.id, socket.userId, socket.username, () => {
          const isOnline = onlineUsers.has(targetUser.id);
          callback({ success: true, targetUserId: targetUser.id, isOnline });

          const targetSocket = getSocketByUserId(targetUser.id);
          if (targetSocket) {
            targetSocket.emit('user_added_as_contact', {
              userId: socket.userId,
              username: socket.username
            });
          }
        });
      });
    });
  });

  // ─── إرسال ملف ────────────────────────────────────────────
  socket.on('send_file', ({ recipientUserId, fileName, fileSize, fileData }) => {
    if (!socket.userId) return;

    const recipientSocket = getSocketByUserId(recipientUserId);

    if (recipientSocket) {
      // الطرف الثاني متصل — أرسل فوراً
      recipientSocket.emit('receive_file', {
        senderUserId:   socket.userId,
        senderUsername: socket.username,
        fileName,
        fileSize,
        fileData,
        timestamp: new Date()
      });
      socket.emit('file_sent_success', { recipientUserId, fileName, timestamp: new Date() });
      console.log(`[file] ${socket.username} → ${socket.userId?.slice(0,8)}: ${fileName}`);
    } else {
      // حفظ في قائمة الانتظار
      savePendingFile(socket.userId, socket.username, recipientUserId, fileName, fileSize, fileData, (err) => {
        if (err) {
          socket.emit('file_error', { error: 'فشل حفظ الملف في قائمة الانتظار' });
        } else {
          socket.emit('file_queued', { recipientUserId, fileName, status: 'pending', timestamp: new Date() });
          console.log(`[pending] ${fileName} محفوظ لـ ${recipientUserId?.slice(0,8)}`);
        }
      });
    }
  });

  // ─── جلب قائمة الجهات ─────────────────────────────────────
  socket.on('get_contacts', (callback) => {
    if (!socket.userId) return callback({ success: false, error: 'لم تسجل دخول' });
    getContacts(socket.userId, (err, contacts) => {
      if (err) return callback({ success: false, error: err.message });
      // أضف حالة الاتصال الحية
      const withStatus = contacts.map(c => ({
        ...c,
        isOnline: onlineUsers.has(c.contactUserId) ? 1 : 0
      }));
      callback({ success: true, contacts: withStatus });
    });
  });

  // ─── استقبال chunk وتوجيهه للمستقبل أو حفظه ────────────────
  socket.on('send_chunk', ({ recipientUserId, name, type, size, total, index, data }) => {
    if (!socket.userId) return;
    const recipientSocket = getSocketByUserId(recipientUserId);
    if (recipientSocket) {
      recipientSocket.emit('receive_chunk', { name, type, size, total, index, data });
    } else {
      // الطرف غير متصل — عند اكتمال كل الـ chunks نحفظ
      // (للتبسيط: نُخبر المرسل بأن الطرف غير متصل)
      if (index === 0) {
        socket.emit('file_queued', { recipientUserId, fileName: name, status: 'pending', timestamp: new Date() });
      }
    }
  });

  // ─── ping ──────────────────────────────────────────────────
  socket.on('ping_test', () => socket.emit('pong_test', { time: Date.now() }));

  // ─── قطع الاتصال ──────────────────────────────────────────
  socket.on('disconnect', () => {
    const { userId, username, deviceId } = socket;
    if (userId) {
      onlineUsers.delete(userId);
      notifyContacts(userId, username, false);
      console.log(`[-] انقطع: ${username}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ AirRoom v2.0 يعمل على المنفذ ${PORT}`);
  console.log(`🌐 افتح: http://localhost:${PORT}`);
});
