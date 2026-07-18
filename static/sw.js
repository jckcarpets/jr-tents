// J&R TENTS — minimal service worker.
// Purpose: make the app installable (standalone, no browser chrome) and load
// the app shell fast. It deliberately never caches API responses, so your
// data is always fresh from the server.

const CACHE = 'jrtents-shell-v2';
const SHELL = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/invoice-pdf.js',
  '/static/logo.png',
  '/static/icon-192.png',
  '/static/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API calls — always go to the network for live data.
  if (url.pathname.startsWith('/api/')) {
    return; // default browser handling (network)
  }

  // App shell / static assets: serve from cache instantly, refresh the cache
  // in the background (stale-while-revalidate) so updates arrive next open.
  if (url.origin === self.location.origin &&
      (url.pathname.startsWith('/static/') || url.pathname === '/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || refresh;
      })
    );
  }
});
