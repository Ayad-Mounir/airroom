// ═══════════════════════════════════════════════════════════════
//  AirRoom — sw.js
//  المرحلة 6: Service Worker (كاش + إقلاع سريع)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME    = 'airroom-v1';
const CACHE_VERSION = 1;

// الملفات الأساسية التي تُخزَّن عند التثبيت
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
];

// ─── حدث التثبيت: تخزين الملفات الأساسية ────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] تثبيت الإصدار:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] تخزين الملفات الأساسية…');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      // تفعيل الـ SW فوراً بدون انتظار إغلاق التبويبات القديمة
      return self.skipWaiting();
    })
  );
});

// ─── حدث التفعيل: حذف الكاشات القديمة ───────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] تفعيل:', CACHE_NAME);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] حذف كاش قديم:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // السيطرة على جميع التبويبات المفتوحة فوراً
      return self.clients.claim();
    })
  );
});

// ─── حدث الطلبات: استراتيجية Cache First ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل طلبات Socket.io — هي دائماً شبكة
  if (url.pathname.startsWith('/socket.io')) {
    return;
  }

  // تجاهل طلبات POST وغير GET
  if (request.method !== 'GET') {
    return;
  }

  // تجاهل الطلبات من نطاقات خارجية (Google Fonts مثلاً)
  // نتركها تمر عبر الشبكة مباشرة
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache First: ابحث في الكاش أولاً، وإن لم يوجد اجلب من الشبكة وخزّن
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        console.log('[SW] من الكاش:', url.pathname);
        return cached;
      }

      // غير موجود في الكاش — اجلب من الشبكة
      return fetch(request).then((response) => {
        // لا تخزّن إلا الاستجابات الصحيحة
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // خزّن نسخة من الاستجابة في الكاش
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });

        return response;
      }).catch(() => {
        // بدون شبكة ولا كاش — أعد صفحة HTML الأساسية إن أمكن
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
