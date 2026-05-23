# ✈️ AirRoom

> **PWA لتبادل الملفات اللحظي عبر WebSocket** — بدون خوادم وسيطة، بدون تسجيل دخول.

## 🚀 المميزات

- نقل الملفات فوراً بين جهازين عبر الشبكة أو الإنترنت
- تقطيع ذكي (256KB chunks) يدعم ملفات 50MB+
- واجهة عربية RTL بتصميم glassmorphism
- PWA قابل للتثبيت على الهاتف والحاسوب
- إشعارات عند استقبال الملفات في الخلفية
- اقتران بين الأجهزة عبر رابط URL بسيط

## 🛠️ التقنيات

| الطبقة | التقنية |
|---|---|
| الخادم | Node.js + Express 4.x |
| WebSocket | Socket.io 4.x |
| الواجهة | HTML + CSS + Vanilla JS |
| PWA | manifest.json + Service Worker |

## ⚡ التشغيل المحلي

```bash
npm install
npm start
# افتح http://localhost:3000
```

## 🌐 النشر على Railway

1. ارفع على GitHub
2. في [railway.app](https://railway.app): **New Project → Deploy from GitHub Repo**
3. اختر هذا المستودع — يعمل تلقائياً

## 📋 هيكل المشروع

```
airroom/
├── server.js          ← خادم Express + Socket.io
├── package.json
└── public/
    ├── index.html     ← واجهة المستخدم الكاملة
    ├── app.js         ← منطق العميل
    ├── manifest.json  ← إعدادات PWA
    ├── sw.js          ← Service Worker
    └── icon-*.png     ← أيقونات التطبيق
```

## 🤝 المساهمة

راجع [CLAUDE_PERMISSIONS.md](./CLAUDE_PERMISSIONS.md) لفهم نهج التطوير التعاوني.

---

*AirRoom v1.0 — مبني بـ Node.js + Socket.io*
