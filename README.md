# 🌐 AirRoom v2.0 — مشاركة الملفات P2P مثل واتساب

<div align="center">

![Version](https://img.shields.io/badge/Version-2.0.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-%3E%3D18.0.0-green?style=for-the-badge)

**تطبيق ويب متقدم لمشاركة الملفات بين الأجهزة مع نظام جهات اتصال وملفات معلقة**

[🚀 جرب مباشرة](https://airroom-production.up.railway.app) • [المميزات](#-المميزات-الجديدة) • [الدليل](#-دليل-الاستخدام)

</div>

---

## 📋 نبذة عن المشروع

**AirRoom 2.0** هو نسخة محسّنة من تطبيق مشاركة الملفات تضيف ميزات احترافية:
- 📱 **واجهة مثل واتساب** — قائمة جهات، إشعارات حية
- 💾 **قاعدة بيانات SQLite** — حفظ دائم للجهات والملفات
- 📋 **قائمة انتظار ذكية** — إرسال تلقائي عند الاتصال
- 🔔 **إشعارات فورية** — اعرف متى يتصل الأصدقاء

---

## ✨ المميزات الجديدة

### 🔗 نظام جهات الاتصال
- حفظ الأجهزة المتصلة تلقائياً
- عرض حالة كل جهاز (متصل/غير متصل)
- ترتيب الجهات حسب آخر اتصال
- حذف وتحرير الجهات

### 📋 قائمة الانتظار الذكية
- عند إرسال ملف لجهاز غير متصل، يُحفظ تلقائياً
- عند اتصال الجهاز، يُرسل الملف فوراً بدون تدخل منك
- عرض الملفات المعلقة مع التاريخ
- متابعة حالة الإرسال (معلق/مرسل/مستقبل)

### 🔔 نظام الإشعارات
- إخطار عند اتصال/انقطاع جهاز
- إخطار عند استقبال ملف
- إخطار عند حفظ ملف في قائمة الانتظار
- الإشعارات مثل واتساب — تظهر من الأعلى وتختفي

### 💾 التخزين الدائم (SQLite)
```javascript
// جداول قاعدة البيانات:
- contacts       // الجهات المحفوظة
- pending_files  // الملفات المعلقة
- notifications  // سجل الإشعارات
```

---

## 🚀 البدء السريع

### التثبيت المحلي

```bash
# استنسخ المستودع
git clone https://github.com/Ayad-Mounir/airroom.git
cd airroom

# ثبّت المكتبات
npm install

# شغّل الخادم
npm start

# افتح في المتصفح
http://localhost:8080
```

### النشر على Railway

```bash
# الخادم جاهز للنشر مباشرة
# ربط المستودع على Railway وسيعمل تلقائياً
https://airroom-production.up.railway.app
```

---

## 💡 دليل الاستخدام

### الخطوة 1: تسمية الجهاز
```
1. افتح التطبيق
2. أدخل اسم جهازك (مثلاً: "جهازي الشخصي")
3. اضغط "تم"
```

### الخطوة 2: مشاركة معرّف الاقتران
```
سيظهر معرّف فريد لك:
>>> 12345-abcde-67890-fghij <<<

انسخه واشره مع الأصدقاء
```

### الخطوة 3: الاتصال بجهاز آخر
```
- إما: الصق معرّف صديقك في حقل "الاتصال"
- أو: انتظر حتى يدخل معرّفك هو
```

### الخطوة 4: إرسال الملفات
```
بعد الاتصال:
1. اسحب الملفات إلى المنطقة المخصصة
2. أو اضغط "اختر الملفات"

إذا كان الصديق متصل:
✅ الملف يُرسل فوراً

إذا كان غير متصل:
📋 الملف يُحفظ في قائمة الانتظار
🔔 عند اتصاله يُرسل تلقائياً
```

---

## 🏗️ البنية التقنية

### Stack

```
Frontend:
├── HTML5 (Drag & Drop, File API)
├── CSS3 (Responsive Design)
└── JavaScript (Socket.io Client)

Backend:
├── Node.js
├── Express.js (Web Server)
├── Socket.io (Real-time Communication)
└── SQLite3 (Database)
```

### معمارية النظام

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│   Device 1  │ ←-----→  │   Railway    │ ←-----→  │   Device 2  │
│  (Browser)  │  WebSokt │   Server     │ WebSokt  │  (Browser)  │
└─────────────┘          └──────────────┘          └─────────────┘
       ↓                         ↓                        ↓
   localStorage             SQLite Database         localStorage
   (Contacts)              (Persistent Data)        (Contacts)
```

### Socket Events (الأحداث الجديدة)

```javascript
// إرسال الملفات
socket.emit("send_file", {
  recipientDeviceId,
  fileName,
  fileSize,
  fileData
})

// استقبال الملفات
socket.on("receive_file", (data) => {
  // تحميل الملف
})

// الملفات المعلقة
socket.on("receive_pending_file", (file) => {
  // تحميل الملف المعلق
})

// الإشعارات
socket.on("contact_online", ({ deviceId, name }) => {
  // عرض إشعار
})
```

---

## 📁 هيكل المشروع

```
airroom/
├── server.js                 # الخادم (Express + Socket.io + SQLite)
├── package.json              # المكتبات والإصدار
├── airroom.db               # قاعدة البيانات SQLite (يتم إنشاؤها تلقائياً)
├── public/
│   └── index.html           # الواجهة الأمامية (HTML + CSS + JS)
├── README.md                # هذا الملف
└── .gitignore              # ملفات مستثناة من Git
```

---

## 🔧 المتغيرات البيئية

```bash
PORT=8080                    # منفذ الخادم (الافتراضي: 8080)
NODE_ENV=production          # بيئة التشغيل
DATABASE_PATH=./airroom.db   # مسار قاعدة البيانات (الافتراضي: في المجلد الحالي)
```

---

## 🐛 حل المشاكل الشائعة

### ❌ الملفات المعلقة لا تُرسل؟
- تأكد من أن الجهاز متصل بالإنترنت
- أعد تحميل الصفحة
- تحقق من حجم الملف

### ❌ الجهات لا تظهر؟
- تأكد من استخدام نفس المتصفح (أو متصفح آخر في نفس الجهاز)
- امسح ذاكرة التخزين المؤقت
- أعد فتح التطبيق

### ❌ الإشعارات لا تظهر؟
- تحقق من إعدادات المتصفح
- قد تكون الإشعارات معطلة في الإعدادات

### ❌ قاعدة البيانات تالفة؟
```bash
# احذف الملف وسيتم إنشاؤه من جديد
rm airroom.db
npm start
```

---

## 🚀 المميزات القادمة (Roadmap)

- [ ] تشفير نهاية لنهاية (E2E Encryption)
- [ ] مشاركة الملفات بالروابط
- [ ] سجل المحادثات والملفات
- [ ] تطبيق سطح المكتب (Electron)
- [ ] تطبيق الهاتف (React Native)
- [ ] مزامنة تلقائية للمجلدات
- [ ] دعم الملفات الفائقة الحجم (> 1GB)

---

## 🛠️ التطوير والمساهمة

### متطلبات التطوير
```bash
git clone https://github.com/Ayad-Mounir/airroom.git
cd airroom
npm install
npm run dev
```

### كيفية المساهمة
1. **Fork** المستودع
2. أنشئ **فرع** جديد (`git checkout -b feature/amazing`)
3. **Commit** التغييرات (`git commit -m "أضفت ميزة رائعة"`)
4. **Push** إلى الفرع (`git push origin feature/amazing`)
5. افتح **Pull Request**

---

## 📄 الترخيص

هذا المشروع مرخّص تحت **MIT License**

---

## 👤 المطور

**Ayad Mounir** — [GitHub](https://github.com/Ayad-Mounir)

---

## 💬 الدعم

هل لديك سؤال أو مشكلة؟
- 📧 افتح [Issue](https://github.com/Ayad-Mounir/airroom/issues)
- 💡 اقترح ميزة جديدة
- 🐛 ابلّغ عن خطأ

---

<div align="center">

**صُنع بـ ❤️ باستخدام Node.js، Express، Socket.io و SQLite**

إذا أعجبك المشروع، ⭐ **امنح نجمة!**

</div>