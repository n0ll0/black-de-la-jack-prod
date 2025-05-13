// Basic service worker for offline support
const CACHE_NAME = 'bdlj-cache-v1';
const urlsToCache = [
  './index.html',
  './index.js',
  './static/styles.css',
  './static/Black de la Jack.svg',
  './static/bluetooth.svg',
  './static/site.webmanifest',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
