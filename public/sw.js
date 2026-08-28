const CACHE_NAME = 'rhythm-bubbles-v6';
const CORE_ASSETS = [
  './',
  './manifest.webmanifest',
  './art/bubble-garden.webp',
  './art/icon-192.png',
  './art/icon-512.png',
  './audio/bubble-garden-groove-v2.wav',
  './audio/tap.wav',
  './audio/correct-pop-1.wav',
  './audio/correct-pop-2.wav',
  './audio/correct-pop-3.wav',
  './audio/wrong-wobble.wav',
  './audio/level-up.wav',
  './audio/countdown.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
