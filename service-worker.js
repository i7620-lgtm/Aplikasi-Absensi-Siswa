const CACHE_NAME = 'absensi-cache-v5';
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
const crossOriginUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://rsms.me/inter/inter.css',
  'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      
      const cacheLocal = cache.addAll(localUrlsToCache);

      const cacheCrossOrigin = Promise.all(
        crossOriginUrlsToCache.map(url => {
          const request = new Request(url, { mode: 'no-cors' });
          return fetch(request).then(response => {
            return cache.put(url, response);
          }).catch(err => {
              console.error(`Failed to fetch and cache cross-origin URL: ${url}`, err);
          });
        })
      );

      return Promise.all([cacheLocal, cacheCrossOrigin]);
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Network-first strategy for navigation and assets.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
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
        })
    );
});


// --- BACKGROUND SYNC LOGIC ---

const DB_NAME = 'AbsensiAppDB';
const DB_VERSION = 2; // Must match main app's db version
const QUEUE_STORE_NAME = 'offline-queue';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject('IDB open error in SW: ' + e.target.errorCode);
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

function getFromIdb(storeName, key) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(storeName)) {
                resolve(undefined);
                db.close();
                return;
            }
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(key);
            getRequest.onsuccess = () => resolve(getRequest.result ? getRequest.result.value : undefined);
            getRequest.onerror = (e) => reject('IDB get error in SW: ' + e.target.errorCode);
        });
    });
}

function setInIdb(storeName, key, value) {
     return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject('IDB set error in SW: ' + e.target.errorCode);
        });
    });
}


async function syncOfflineActions() {
    console.log('Service Worker: Sync event triggered. Processing offline queue.');
    try {
        const queue = await getFromIdb(QUEUE_STORE_NAME, 'actions');
        if (!queue || queue.length === 0) {
            console.log('Service Worker: Offline queue is empty. Nothing to sync.');
            return;
        }

        console.log(`Service Worker: Syncing ${queue.length} actions.`);
        
        // Use Promise.all to send all requests concurrently
        const fetchPromises = queue.map(request =>
            fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request.body)
            }).then(response => {
                if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            })
        );
        
        await Promise.all(fetchPromises);

        await setInIdb(QUEUE_STORE_NAME, 'actions', []);

        self.registration.showNotification('Sinkronisasi Berhasil', {
            body: `Perubahan offline Anda (${queue.length} aksi) telah berhasil disimpan.`,
            icon: 'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png'
        });
        console.log('Service Worker: Offline queue synced and cleared successfully.');

    } catch (error) {
        console.error('Service Worker: Sync failed.', error);
        self.registration.showNotification('Sinkronisasi Gagal', {
            body: 'Beberapa perubahan offline gagal disimpan. Silakan periksa koneksi Anda dan coba lagi.',
            icon: 'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png'
        });
        // Do not clear the queue, let the browser retry the sync later.
    }
}

self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-actions') {
    console.log("Service Worker: Received sync event for offline actions.");
    event.waitUntil(syncOfflineActions());
  }
});
