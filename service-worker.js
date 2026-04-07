const CACHE_NAME = 'absensi-cache-v13'; // Updated version for CDN caching
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

const CDN_ORIGINS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.sheetjs.com',
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
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

  // FULL ONLINE: API calls and unapproved cross-origin requests always go to network
  if (url.pathname.startsWith('/api/') || (url.origin !== location.origin && !CDN_ORIGINS.includes(url.origin))) {
     event.respondWith(fetch(event.request));
     return;
  }

  // For local static assets AND approved CDNs: Stale-While-Revalidate Strategy
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {}); // Ignore network errors in background
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      });
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
