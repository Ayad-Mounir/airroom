const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const sqlite3  = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path     = require('path');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  pingTimeout:  60000,
  pingInterval: 25000,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ═══════════════════════════════════════════════════════════════
//  قاعدة البيانات SQLite
// ═══════════════════════════════════════════════════════════════

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'airroom.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ خطأ في قاعدة البيانات:', err);
  else     console.log('✅ قاعدة البيانات:', dbPath);
});

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    username  TEXT UNIQUE NOT NULL,
    deviceId  TEXT UNIQUE NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL,
    contactUserId   TEXT NOT NULL,
    contactUsername TEXT NOT NULL,
    isOnline        INTEGER DEFAULT 0,
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    UNIQUE(userId, contactUserId)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pending_files (
    id              TEXT PRIMARY KEY,
    senderUserId    TEXT NOT NULL,
    senderUsername  TEXT NOT NULL,
    recipientUserId TEXT NOT NULL,
    fileName        TEXT NOT NULL,
    fileSize        INTEGER NOT NULL,
    fileData        BLOB,
    mimeType        TEXT DEFAULT 'application/octet-stream',
    status          TEXT DEFAULT 'pending',
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    sentAt          DATETIME
  )`);
});

// ─── دوال قاعدة البيانات ──────────────────────────────────────

function dbRun(sql, params = []) {
  return new Promise((res, rej) =>
    db.run(sql, params, function(err) { err ? rej(err) : res(this); })
  );
}
function dbGet(sql, params = []) {
  return new Promise((res, rej) =>
    db.get(sql, params, (err, row) => { err ? rej(err) : res(row); })
  );
}
function dbAll(sql, params = []) {
  return new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => { err ? rej(err) : res(rows); })
  );
}

async function registerUser(username) {
  const userId   = uuidv4();
  const deviceId = uuidv4();
  try {
    await dbRun(
      `INSERT INTO users (id, username, deviceId) VALUES (?, ?, ?)`,
      [userId, username, deviceId]
    );
    return { success: true, userId, deviceId, username };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'اسم المستخدم مستخدم بالفعل' };
    }
    return { success: false, error: err.message };
  }
}

async function getUserByDeviceId(deviceId) {
  return dbGet(`SELECT * FROM users WHERE deviceId = ?`, [deviceId]);
}

async function getUserByUsername(username) {
  return dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
}

async function updateLastLogin(userId) {
  return dbRun(`UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?`, [userId]);
}

async function addContact(userId, contactUserId, contactUsername) {
  const id = uuidv4();
  return dbRun(
    `INSERT OR IGNORE INTO contacts (id, userId, contactUserId, contactUsername) VALUES (?, ?, ?, ?)`,
    [id, userId, contactUserId, contactUsername]
  );
}

async function getContacts(userId) {
  return dbAll(
    `SELECT * FROM contacts WHERE userId = ? ORDER BY isOnline DESC, createdAt DESC`,
    [userId]
  );
}

async function updateContactOnlineStatus(userId, contactUserId, isOnline) {
  return dbRun(
    `UPDATE contacts SET isOnline = ? WHERE userId = ? AND contactUserId = ?`,
    [isOnline ? 1 : 0, userId, contactUserId]
  );
}

async function savePendingFile(senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData, mimeType) {
  const id = uuidv4();
  return dbRun(
    `INSERT INTO pending_files
       (id, senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData, mimeType, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [id, senderUserId, senderUsername, recipientUserId, fileName, fileSize, fileData, mimeType || 'application/octet-stream']
  );
}

async function getPendingFiles(recipientUserId) {
  return dbAll(
    `SELECT * FROM pending_files WHERE recipientUserId = ? AND status = 'pending' ORDER BY createdAt ASC`,
    [recipientUserId]
  );
}

async function markFileAsSent(fileId) {
  return dbRun(
    `UPDATE pending_files SET status = 'sent', sentAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [fileId]
  );
}

// ═══════════════════════════════════════════════════════════════
//  REST API
// ═══════════════════════════════════════════════════════════════

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/check-username/:username', async (req, res) => {
  const username = req.params.username?.trim();
  if (!username || username.length < 3) {
    return res.status(400).json({ available: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
  }
  try {
    const user = await getUserByUsername(username);
    res.json({
      available: !user,
      message:   user ? 'هذا الاسم مستخدم بالفعل' : 'هذا الاسم متوفر'
    });
  } catch (err) {
    res.status(500).json({ available: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', online: onlineUsers.size }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
//  خريطة المستخدمين المتصلين
//  { userId → { socketId, username, deviceId } }
// ═══════════════════════════════════════════════════════════════

const onlineUsers = new Map();

// خريطة تجميع الـ chunks المعلقة للأوفلاين
// { recipientUserId_fileName → { chunks: Map<index,data>, meta } }
const pendingChunks = new Map();

function getSocketByUserId(userId) {
  const entry = onlineUsers.get(userId);
  if (!entry) return null;
  return io.sockets.sockets.get(entry.socketId) || null;
}

function registerSocketUser(socket, userId, username, deviceId) {
  // إذا كان هناك اتصال قديم لنفس المستخدم، أغلقه بهدوء
  const existing = onlineUsers.get(userId);
  if (existing && existing.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(existing.socketId);
    if (oldSocket) {
      oldSocket.emit('session_replaced');
      oldSocket.disconnect(true);
    }
  }
  onlineUsers.set(userId, { socketId: socket.id, username, deviceId });
  socket.userId   = userId;
  socket.username = username;
  socket.deviceId = deviceId;
}

// ─── إرسال الملفات المعلقة عند دخول المستخدم ─────────────────

async function deliverPendingFiles(socket, userId) {
  try {
    const files = await getPendingFiles(userId);
    if (!files || files.length === 0) return;
    for (const file of files) {
      socket.emit('receive_pending_file', {
        fileId:         file.id,
        senderUserId:   file.senderUserId,
        senderUsername: file.senderUsername,
        fileName:       file.fileName,
        fileSize:       file.fileSize,
        fileData:       file.fileData,
        mimeType:       file.mimeType,
        createdAt:      file.createdAt
      });
      await markFileAsSent(file.id);
      console.log(`[pending→delivered] ${file.fileName} → ${socket.username}`);
    }
  } catch (err) {
    console.error('[deliverPendingFiles]', err);
  }
}

// ─── إشعار جهات اتصال المستخدم بحالته ───────────────────────

async function notifyContacts(userId, username, isOnline) {
  try {
    const contacts = await getContacts(userId);
    if (!contacts) return;
    for (const contact of contacts) {
      await updateContactOnlineStatus(contact.contactUserId, userId, isOnline);
      const s = getSocketByUserId(contact.contactUserId);
      if (s) {
        s.emit(isOnline ? 'contact_online' : 'contact_offline', { userId, username });
      }
    }
  } catch (err) {
    console.error('[notifyContacts]', err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Socket.io
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ─── تسجيل مستخدم جديد ────────────────────────────────────
  socket.on('register_new_user', async ({ username }, callback) => {
    if (!username || username.trim().length < 3) {
      return callback({ success: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    }
    const result = await registerUser(username.trim());
    if (!result.success) return callback(result);

    registerSocketUser(socket, result.userId, result.username, result.deviceId);
    console.log(`[register] ${result.username}`);
    callback(result);
    notifyContacts(result.userId, result.username, true);
  });

  // ─── تسجيل دخول بالـ deviceId ─────────────────────────────
  socket.on('login_user', async ({ deviceId }, callback) => {
    try {
      const user = await getUserByDeviceId(deviceId);
      if (!user) return callback({ success: false, error: 'معرّف الجهاز غير صحيح' });

      registerSocketUser(socket, user.id, user.username, deviceId);
      updateLastLogin(user.id);
      console.log(`[login] ${user.username}`);
      callback({ success: true, userId: user.id, username: user.username, deviceId });

      notifyContacts(user.id, user.username, true);
      deliverPendingFiles(socket, user.id);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── إعادة اتصال بالاسم ────────────────────────────────────
  socket.on('reconnect_user', async ({ username }, callback) => {
    if (!username) return callback({ success: false, error: 'الاسم مطلوب' });
    try {
      const user = await getUserByUsername(username.trim());
      if (!user) return callback({ success: false, error: 'المستخدم غير موجود' });

      registerSocketUser(socket, user.id, user.username, user.deviceId);
      updateLastLogin(user.id);
      console.log(`[reconnect] ${user.username}`);
      callback({ success: true, userId: user.id, username: user.username, deviceId: user.deviceId });

      notifyContacts(user.id, user.username, true);
      deliverPendingFiles(socket, user.id);
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── الاتصال بمستخدم آخر ──────────────────────────────────
  socket.on('connect_to_user', async ({ targetUsername }, callback) => {
    if (!socket.userId) return callback({ success: false, error: 'لم تسجل دخول' });
    try {
      const targetUser = await getUserByUsername(targetUsername);
      if (!targetUser) return callback({ success: false, error: 'المستخدم غير موجود' });
      if (targetUser.id === socket.userId) return callback({ success: false, error: 'لا يمكنك إضافة نفسك' });

      await addContact(socket.userId, targetUser.id, targetUser.username);
      await addContact(targetUser.id, socket.userId, socket.username);

      const isOnline = onlineUsers.has(targetUser.id);
      callback({ success: true, targetUserId: targetUser.id, isOnline });

      const targetSocket = getSocketByUserId(targetUser.id);
      if (targetSocket) {
        targetSocket.emit('user_added_as_contact', {
          userId: socket.userId,
          username: socket.username
        });
      }
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── إرسال ملف كامل (للملفات الصغيرة أو الـ pending) ──────
  socket.on('send_file', async ({ recipientUserId, fileName, fileSize, fileData, mimeType }) => {
    if (!socket.userId) return;

    const recipientSocket = getSocketByUserId(recipientUserId);

    if (recipientSocket) {
      recipientSocket.emit('receive_file', {
        senderUserId:   socket.userId,
        senderUsername: socket.username,
        fileName,
        fileSize,
        fileData,
        mimeType: mimeType || 'application/octet-stream',
        timestamp: new Date()
      });
      socket.emit('file_sent_success', { recipientUserId, fileName, timestamp: new Date() });
      console.log(`[file→live] ${socket.username} → ${fileName}`);
    } else {
      try {
        await savePendingFile(socket.userId, socket.username, recipientUserId, fileName, fileSize, fileData, mimeType);
        socket.emit('file_queued', { recipientUserId, fileName, status: 'pending', timestamp: new Date() });
        console.log(`[file→queue] ${fileName} saved for ${recipientUserId?.slice(0, 8)}`);
      } catch (err) {
        socket.emit('file_error', { error: 'فشل حفظ الملف: ' + err.message });
      }
    }
  });

  // ─── إرسال chunk ──────────────────────────────────────────
  socket.on('send_chunk', ({ recipientUserId, name, type, size, total, index, data }) => {
    if (!socket.userId) return;

    const recipientSocket = getSocketByUserId(recipientUserId);

    if (recipientSocket) {
      // المستقبل متصل — أرسل فوراً
      recipientSocket.emit('receive_chunk', {
        senderUserId:   socket.userId,
        senderUsername: socket.username,
        name, type, size, total, index, data
      });
    } else {
      // المستقبل غير متصل — اجمع الـ chunks في الذاكرة
      const key = `${recipientUserId}::${name}`;
      if (!pendingChunks.has(key)) {
        pendingChunks.set(key, {
          chunks:   new Map(),
          total,
          type:     type || 'application/octet-stream',
          size,
          sender:   socket.userId,
          senderName: socket.username,
          fileName: name,
          recipient: recipientUserId
        });
      }
      const entry = pendingChunks.get(key);
      entry.chunks.set(index, data);

      // أخبر المرسل بالتقدم
      if (index === 0) {
        socket.emit('file_queued', {
          recipientUserId,
          fileName: name,
          status:   'pending',
          timestamp: new Date()
        });
      }

      // عند اكتمال جميع الـ chunks، احفظ الملف في DB
      if (entry.chunks.size === total) {
        // رتّب الـ chunks وأنشئ Buffer
        const orderedChunks = [];
        for (let i = 0; i < total; i++) {
          const chunk = entry.chunks.get(i);
          if (chunk) orderedChunks.push(Buffer.from(chunk));
        }
        const combined = Buffer.concat(orderedChunks);
        savePendingFile(
          entry.sender, entry.senderName, entry.recipient,
          entry.fileName, entry.size, combined, entry.type
        ).then(() => {
          console.log(`[chunks→queue] ${name} (${(combined.length/1024).toFixed(0)}KB) saved`);
        }).catch(err => {
          console.error('[chunks→queue] save error:', err);
          socket.emit('file_error', { error: 'فشل حفظ الملف في قائمة الانتظار' });
        });
        pendingChunks.delete(key);
      }
    }
  });

  // ─── جلب قائمة الجهات ─────────────────────────────────────
  socket.on('get_contacts', async (callback) => {
    if (!socket.userId) return callback({ success: false, error: 'لم تسجل دخول' });
    try {
      const contacts = await getContacts(socket.userId);
      const withStatus = (contacts || []).map(c => ({
        ...c,
        isOnline: onlineUsers.has(c.contactUserId) ? 1 : 0
      }));
      callback({ success: true, contacts: withStatus });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  // ─── ping ──────────────────────────────────────────────────
  socket.on('ping_test', () => socket.emit('pong_test', { time: Date.now() }));

  // ─── قطع الاتصال ──────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const { userId, username } = socket;
    if (userId) {
      // تحقق أن هذا الـ socket هو الحالي فعلاً (وليس session قديمة)
      const current = onlineUsers.get(userId);
      if (current && current.socketId === socket.id) {
        onlineUsers.delete(userId);
        notifyContacts(userId, username, false);
        console.log(`[-] ${username} (${reason})`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ AirRoom v3.0 — المنفذ ${PORT}`);
});
