// Minimal service worker for PWA install support
// This does NOT provide offline functionality - it just enables the "Add to Home Screen" prompt

self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

// Pass through all fetch requests to the network (no caching)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
