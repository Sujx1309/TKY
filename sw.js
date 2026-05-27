// ═══════════════════════════════════════════════════
//  TKY Squad — Service Worker  (sw.js)
//  Offline caching + background sync
// ═══════════════════════════════════════════════════

const CACHE_NAME   = 'tky-squad-v1';
const STATIC_CACHE = 'tky-static-v1';
const DATA_CACHE   = 'tky-data-v1';

// ── Files jo definitely cache karva chhe (App Shell) ──
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-128.png',
  '/icon-192.png',
  '/icon-512.png',
  // Google Fonts (preload)
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Mukta+Vaani:wght@400;500;600;700&display=swap',
];

// ─────────────────────────────────────────────────────
//  1. INSTALL  — App Shell cache karo
// ─────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching App Shell');
      // addAll fail thay to bhi install continue karo (non-critical assets)
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Could not cache:', url, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─────────────────────────────────────────────────────
//  2. ACTIVATE  — Juna caches delete karo
// ─────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  const allowedCaches = [STATIC_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !allowedCaches.includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────────────
//  3. FETCH  — Offline strategy
//
//  Strategy:
//  • App Shell (HTML/CSS/JS/images) → Cache First
//  • Google Fonts                   → Cache First  
//  • Supabase API calls             → Network First, fallback offline JSON
//  • Baki badhu                     → Network First, fallback cache
// ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Supabase / external API calls → Network First ──
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.io')
  ) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // ── Google Fonts → Cache First ──
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Same-origin requests (HTML, JS, CSS, images) → Cache First ──
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Baki badhu → Network First ──
  event.respondWith(networkFirst(request, DATA_CACHE));
});

// ─────────────────────────────────────────────────────
//  Helper: Cache First
//  Cache ma milyo → return  |  nahi milyo → network fetch + cache
// ─────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Sirf successful responses cache karo
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline fallback: index.html return karo (SPA navigation mate)
    const fallback = await cache.match('/index.html');
    if (fallback) return fallback;
    return offlineFallbackResponse();
  }
}

// ─────────────────────────────────────────────────────
//  Helper: Network First
//  Network try karo → fail thay to cache → cache nahi to offline message
// ─────────────────────────────────────────────────────
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallbackResponse();
  }
}

// ─────────────────────────────────────────────────────
//  Offline Fallback Response
//  API call fail thay ane cache ma pan nahi hoy tyare
// ─────────────────────────────────────────────────────
function offlineFallbackResponse() {
  return new Response(
    JSON.stringify({ _offline: true, message: 'You are offline. Please check your internet connection.' }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// ─────────────────────────────────────────────────────
//  4. MESSAGE  — Main thread thi update trigger karva
//     Usage: navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
// ─────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded — TKY Squad v1');
