// TKY Squad — Service Worker v3

const CACHE_NAME = 'tky-v3';
const ICON = 'https://sujx1309.github.io/TKY/icon-192.png';
const APP_URL = 'https://sujx1309.github.io/TKY/';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: 'New Update', body: e.data ? e.data.text() : '' }; }

  e.waitUntil(self.registration.showNotification(data.title || 'New Update', {
    body: data.body || data.msg || '',
    icon: ICON,
    // badge nai — status bar ma default system icon aavse
    tag: data.tag || 'tky-push',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: data.url || APP_URL }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || APP_URL;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes('sujx1309.github.io') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SHOW_NOTIF') {
    const d = e.data;
    self.registration.showNotification(d.title || 'New Update', {
      body: d.body || '',
      icon: ICON,
      tag: d.tag || 'tky-msg',
      vibrate: [200, 100, 200],
      data: { url: d.url || APP_URL }
    });
  }
  if (e.data.type === 'GET_SUBSCRIPTION') {
    self.registration.pushManager.getSubscription().then(sub => {
      e.source?.postMessage({ type: 'SUBSCRIPTION', sub: sub ? sub.toJSON() : null });
    });
  }
});
