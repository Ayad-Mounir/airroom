// ═══════════════════════════════════════════════════════════════
//  AirRoom — Service Worker v3
//  استراتيجية: Network First للـ HTML، Cache First للأصول
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'airroom-v4';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ─── التثبيت ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] install:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── التفعيل: حذف الكاشات القديمة ───────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] activate:', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── الطلبات ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل Socket.io وطلبات POST
  if (url.pathname.startsWith('/socket.io') || request.method !== 'GET') return;

  // طلبات خارجية — شبكة مباشرة
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // API — شبكة دائماً (لا كاش)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // HTML — Network First (نضمن تحديث الكود دائماً)
  if (request.destination === 'document' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // أصول ثابتة — Cache First
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// ─── Push Notifications ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'AirRoom', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'AirRoom', {
      body:             payload.body || '',
      icon:             '/icon-192.png',
      badge:            '/icon-192.png',
      tag:              payload.tag || 'airroom',
      vibrate:          [200, 100, 200],
      requireInteraction: payload.requireInteraction || false,
      data:             payload.data || {}
    })
  );
});

// ─── نقر على الإشعار ─────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow('/');
    })
  );
});
