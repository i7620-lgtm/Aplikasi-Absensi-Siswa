const CACHE_NAME = 'absensi-cache-v12'; // Updated version
const localUrlsToCache = [
  '/',
  '/index.html',
  '/terms.html',
  '/privacy.html',
  '/js/main.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/templates.js',
  '/js/ui.js',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      return cache.addAll(localUrlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  const url = new URL(event.request.url);

  // FULL ONLINE: API calls and cross-origin requests (like Google profiles) always go to network
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
     event.respondWith(fetch(event.request));
     return;
  }

  // For local static assets: Network First, cache only valid 200 responses
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Only cache valid, non-opaque responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
