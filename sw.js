// TKY Squad — Service Worker
// Goal: app always opens (never shows the browser's native "You're offline" page),
// and slow connections don't get stuck — network is tried first with a timeout,
// falling back to whatever is cached.

const CACHE_VERSION = 'tky-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-128.png',
  './icon-192.png',
  './icon-512.png'
];

// Requests that must NEVER be served from cache (live data / auth)
function isApiRequest(url) {
  return url.hostname.endsWith('supabase.co');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network request with a timeout — so a slow connection falls back to cache
// quickly instead of leaving the user staring at a blank/loading screen.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST/PATCH/etc (Supabase writes)

  const url = new URL(req.url);
  if (isApiRequest(url)) return; // let Supabase calls hit the network directly, always

  // Page navigations (loading the app itself): network-first with timeout, cache fallback.
  // This is the key fix — if the network fails or is too slow, we serve the cached
  // app shell instead of the browser falling through to its native offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 4000)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match(req))
        )
    );
    return;
  }

  // Static assets (JS/CSS/fonts/images): cache-first, refresh cache in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
