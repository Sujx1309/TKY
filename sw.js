// CommerceKing — Service Worker
// Place this file in the ROOT of your GitHub repo (same folder as index.html)

const CACHE = 'ck-v2';
const ICON  = 'https://sujx1309.github.io/TKY/icon-192.png';

// ── Install: skip waiting immediately ──
self.addEventListener('install', e => {
  self.skipWaiting();
});

// ── Activate: take control of all clients ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for same-origin, network-first for others ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});

// ── Push: show notification when server sends push ──
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = {title: 'CommerceKing', body: e.data?.text() || ''}; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'CommerceKing', {
      body:    data.body || data.msg || '',
      icon:    ICON,
      badge:   ICON,
      tag:     data.tag || 'ck-push',
      vibrate: [200, 100, 200],
      data:    { url: data.url || self.location.origin }
    })
  );
});

// ── Message from page: show notification via SW (works in PWA background) ──
self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIF') {
    self.registration.showNotification(e.data.title || 'CommerceKing', {
      body:    e.data.body || '',
      icon:    ICON,
      badge:   ICON,
      tag:     e.data.tag || 'ck-msg',
      vibrate: [200, 100, 200]
    });
  }
});

// ── Notification click: focus app or open it ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || self.location.origin;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      // Focus existing window if open
      for (const c of cs) {
        if (c.url === targetUrl && 'focus' in c) return c.focus();
      }
      // Otherwise open new window
      return clients.openWindow(targetUrl);
    })
  );
});
