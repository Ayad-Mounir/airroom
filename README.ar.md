<div align="center">

<img src="public/icon-192.png" width="96" alt="شعار AirRoom" />

# AirRoom

**مشاركة الملفات P2P فوراً — مثل واتساب، للملفات**

[![Node.js](https://img.shields.io/badge/Node.js-≥18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?logo=socket.io)](https://socket.io)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen)](package.json)

أرسل الملفات فوراً بين الأجهزة — سواء على نفس الشبكة أو عبر الإنترنت.  
بدون حسابات، بدون رفع سحابي، بدون حدود للحجم يفرضها طرف ثالث.

[المميزات](#-المميزات) · [التشغيل السريع](#-التشغيل-السريع) · [المعمارية](#-المعمارية) · [مرجع الـ API](#-مرجع-الـ-api) · [النشر](#-النشر-على-railway) · [المساهمة](#-المساهمة)

</div>

---

## ✨ المميزات

| الميزة | الوصف |
|---|---|
| ⚡ **نقل فوري** | الملفات تصل في الوقت الحقيقي عبر Socket.io WebSocket — بدون أي تأخير |
| 📴 **قائمة انتظار أوفلاين** | أرسل لجهات اتصال غير متصلة؛ الملفات تُحفظ في SQLite وتُسلَّم فور اتصالهم |
| 🧩 **نقل مجزأ (Chunks)** | الملفات الكبيرة تُقسَّم إلى أجزاء، تُجمَّع بالترتيب وتُحفظ بشكل موثوق |
| 👥 **نظام جهات الاتصال** | أضف جهات اتصال بالاسم؛ شاهد حالة الاتصال (أونلاين/أوفلاين) لحظياً |
| 📱 **PWA — قابل للتثبيت** | ثبّت على Android أو iOS أو سطح المكتب — يعمل كتطبيق أصلي |
| 🔌 **يعمل أوفلاين** | Service Worker يخزّن واجهة التطبيق في الكاش — يفتح بدون إنترنت |
| 🔑 **هوية الجهاز** | تسجيل دخول دائم عبر `deviceId` محفوظ محلياً — بدون كلمة مرور |
| 🌐 **أي شبكة** | LAN، Wi-Fi، أو الإنترنت العام — يعمل في أي مكان يصل فيه السيرفر |

---

## 🚀 التشغيل السريع

### المتطلبات

- **Node.js** ≥ 18.0
- **npm** ≥ 8

### التشغيل المحلي

```bash
# 1. استنسخ المستودع
git clone https://github.com/your-username/airroom.git
cd airroom

# 2. ثبّت الاعتماديات
npm install

# 3. شغّل السيرفر
npm start
```

افتح المتصفح على **`http://localhost:8080`**

> **نصيحة:** لمشاركة الملفات بين أجهزة على نفس الشبكة، استخدم IP جهازك المحلي (مثلاً `http://192.168.1.x:8080`) بدل `localhost`.

### متغيرات البيئة

| المتغير | القيمة الافتراضية | الوصف |
|---|---|---|
| `PORT` | `8080` | منفذ السيرفر |
| `DATABASE_PATH` | `./airroom.db` | مسار ملف قاعدة البيانات SQLite |

```bash
# مثال
PORT=3000 DATABASE_PATH=/data/airroom.db npm start
```

---

## 📐 المعمارية

```
airroom/
├── server.js          # الـ Backend — Express + Socket.io
├── package.json
└── public/
    ├── index.html     # تطبيق الصفحة الواحدة (UI + منطق العميل)
    ├── install.html   # صفحة دليل تثبيت PWA
    ├── sw.js          # Service Worker (استراتيجية الكاش)
    ├── manifest.json  # بيانات PWA
    ├── favicon.ico
    ├── favicon-32.png
    ├── icon-192.png   # أيقونة PWA
    └── icon-512.png   # أيقونة PWA (شاشة التحميل)
```

### المكدس التقني

| الطبقة | التقنية |
|---|---|
| **بيئة التشغيل** | Node.js ≥ 18 |
| **سيرفر HTTP** | Express 4 |
| **الوقت الحقيقي** | Socket.io 4.7 |
| **قاعدة البيانات** | SQLite 3 (عبر `sqlite3`، وضع WAL) |
| **الواجهة الأمامية** | Vanilla JS + HTML/CSS (بدون فريمورك) |
| **PWA** | Service Worker + Web App Manifest |

### مخطط قاعدة البيانات

**`users`** — الأجهزة المسجّلة
```sql
id TEXT PRIMARY KEY, username TEXT UNIQUE, deviceId TEXT UNIQUE,
createdAt DATETIME, lastLogin DATETIME
```

**`contacts`** — قائمة الاتصال ثنائية الاتجاه
```sql
id, userId → users.id, contactUserId, contactUsername, isOnline, createdAt
UNIQUE(userId, contactUserId)
```

**`pending_files`** — قائمة انتظار التسليم أوفلاين
```sql
id, senderUserId, senderUsername, recipientUserId,
fileName, fileSize, fileData BLOB, mimeType, status, createdAt, sentAt
```

---

## 📡 مرجع الـ API

### نقاط الـ REST

| الطريقة | المسار | الوصف |
|---|---|---|
| `GET` | `/api/check-username/:username` | التحقق من توفر اسم المستخدم |
| `GET` | `/health` | حالة السيرفر + عدد المستخدمين المتصلين |
| `GET` | `/install.html` | دليل تثبيت PWA |
| `GET` | `*` | SPA fallback ← `index.html` |

### أحداث Socket.io

#### من العميل إلى السيرفر

| الحدث | البيانات | الوصف |
|---|---|---|
| `register_new_user` | `{ username }` | تسجيل حساب جديد |
| `login_user` | `{ deviceId }` | تسجيل دخول بمعرّف الجهاز المحفوظ |
| `reconnect_user` | `{ username }` | إعادة الاتصال بالاسم |
| `connect_to_user` | `{ targetUsername }` | إضافة جهة اتصال |
| `send_file` | `{ recipientUserId, fileName, fileSize, fileData, mimeType }` | إرسال ملف كامل |
| `send_chunk` | `{ recipientUserId, name, type, size, total, index, data }` | إرسال جزء واحد من ملف كبير |
| `get_contacts` | _(لا يوجد)_ | جلب قائمة الاتصال مع الحالة |
| `ping_test` | _(لا يوجد)_ | قياس زمن الاستجابة |

#### من السيرفر إلى العميل

| الحدث | الوصف |
|---|---|
| `receive_file` | استقبال ملف كامل مباشرة |
| `receive_chunk` | استقبال جزء من ملف من مرسل متصل |
| `receive_pending_file` | تسليم ملف مخزّن في قائمة الانتظار عند تسجيل الدخول |
| `file_sent_success` | تأكيد التسليم للمرسل |
| `file_queued` | الملف حُفظ في قائمة الانتظار (المستقبل أوفلاين) |
| `file_error` | فشل التسليم |
| `contact_online` | أحد جهات الاتصال اتصل للتو |
| `contact_offline` | أحد جهات الاتصال انقطع |
| `user_added_as_contact` | شخص ما أضافك كجهة اتصال |
| `session_replaced` | جلستك استُبدلت بتسجيل دخول أحدث |
| `pong_test` | رد الـ ping مع طابع زمني من السيرفر |

---

## 📦 آلية نقل الملفات

```
المرسل                        السيرفر                      المستقبل
  │                               │                               │
  │── send_file / send_chunk ────►│                               │
  │                               │─── هل المستقبل متصل؟ ────────►│
  │                               │    نعم: إعادة توجيه فورية    │
  │◄── file_sent_success ─────────│                               │
  │                               │    لا: حفظ في SQLite          │
  │◄── file_queued ───────────────│                               │
  │                               │                               │
  │                               │  (المستقبل يتصل لاحقاً)       │
  │                               │─── تسليم الملفات المعلقة ────►│
  │                               │◄── markFileAsSent ────────────│
```

---

## 📱 PWA — التثبيت كتطبيق

AirRoom تطبيق ويب تقدمي (PWA) قابل للتثبيت بالكامل.

| المنصة | الخطوات |
|---|---|
| **Android (Chrome)** | اضغط على قائمة المتصفح ← *إضافة إلى الشاشة الرئيسية* |
| **iOS (Safari)** | اضغط مشاركة ← *إضافة إلى الشاشة الرئيسية* |
| **سطح المكتب (Chrome/Edge)** | اضغط على أيقونة التثبيت (⊕) في شريط العنوان |

يستخدم Service Worker استراتيجية **Network First** لملفات HTML و**Cache First** للأصول الثابتة، مما يضمن تحميل التطبيق فورياً حتى بدون إنترنت.

---

## 🚂 النشر على Railway

AirRoom جاهز للنشر على Railway بدون أي إعداد إضافي.

1. ارفع الكود إلى مستودع على GitHub
2. اذهب إلى [railway.app](https://railway.app) ← **New Project** ← **Deploy from GitHub**
3. اختر مستودعك — Railway يكتشف Node.js تلقائياً ويشغّل `npm start`
4. *(اختياري)* اضبط متغيرات البيئة في لوحة تحكم Railway:
   - `DATABASE_PATH` ← `/data/airroom.db` (لقرص دائم)

> **ملاحظة:** في بيئات الإنتاج، أرفق Railway Volume وأشر `DATABASE_PATH` إليه، وإلا سيُعاد ضبط ملف SQLite عند كل إعادة نشر.

---

## 🔒 ملاحظات الأمان

- قيم `deviceId` هي UUIDs تُولَّد من السيرفر وتُحفظ محلياً (`localStorage`). احرص على سرية معرّف جهازك — من يملكه يستطيع تسجيل الدخول باسمك.
- بيانات الملفات تُخزَّن كـ BLOB ثنائي في SQLite. في بيئات الإنتاج، يُنصح بتشفير الملفات الحساسة على القرص.
- السيرفر يقبل CORS من جميع المصادر (`*`). قيّد هذا في الإنتاج إذا لزم الأمر.

---

## 🤝 المساهمة

طلبات السحب مرحّب بها. للتغييرات الكبيرة، يُرجى فتح Issue أولاً لمناقشة ما تريد تغييره.

```bash
# وضع التطوير (إعادة تشغيل تلقائي مع nodemon إن كان مثبتاً)
npx nodemon server.js

# أو ببساطة
npm run dev
```

---

## 📄 الرخصة

[MIT](LICENSE) © مساهمو AirRoom

---

<div align="center">

مبني بـ ⚡ Socket.io · 🗃️ SQLite · 📱 PWA

</div>
