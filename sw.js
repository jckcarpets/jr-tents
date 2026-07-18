// Minimal service worker: exists to satisfy Android Chrome's PWA install
// criteria. It intentionally does NOT cache anything, so the app always
// loads the latest deployed version.
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => { /* network passthrough */ });
