
const CACHE_NAME = 'absensi-cache-v4';
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
      
      // 1. Cache local assets with addAll
      const cacheLocal = cache.addAll(localUrlsToCache);

      // 2. Cache cross-origin assets individually with 'no-cors' mode
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

      // Wait for both local and cross-origin caching to complete
      return Promise.all([cacheLocal, cacheCrossOrigin]);
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignore non-GET requests and requests from browser extensions.
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Use a Network-first strategy for navigation and asset requests.
  // This ensures the user always gets the latest UI when online.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If the fetch is successful, clone it, cache it, and return it.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return networkResponse;
      })
      .catch(() => {
        // If the network request fails (offline), try to get it from the cache.
        return caches.match(event.request);
      })
  );
});


// Clean up old caches
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


self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncDataToServer());
  }
});

// Helper function to get data from IndexedDB within the Service Worker
function getFromIdb(storeName, key) {
    return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open('AbsensiAppDB', 1);
        openRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                 console.log(`Service Worker: Store ${storeName} not found.`);
                 resolve(undefined); // Resolve with undefined if store doesn't exist
                 db.close();
                 return;
            }
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(key);
            getRequest.onsuccess = () => resolve(getRequest.result ? getRequest.result.value : undefined);
            getRequest.onerror = (e) => reject('IDB get error: ' + e.target.errorCode);
        };
        openRequest.onerror = (e) => reject('IDB open error: ' + e.target.errorCode);
        openRequest.onupgradeneeded = (event) => {
             // Handle DB setup if SW runs first. Should not happen in normal flow.
             const db = event.target.result;
             if (!db.objectStoreNames.contains('appState')) {
                db.createObjectStore('appState', { keyPath: 'key' });
             }
        };
    });
}


async function syncDataToServer() {
  console.log('Service Worker: Sync event triggered.');
  
  try {
    const userData = await getFromIdb('appState', 'userData');
    const userProfile = await getFromIdb('appState', 'userProfile');
  
    if (!userData || !userProfile || !userProfile.email) {
        console.log('Service Worker: No data or user profile to sync.');
        return;
    }
    
    const { students_by_class: studentsByClass, saved_logs: savedLogs } = userData;
  
    const response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveData',
        payload: { studentsByClass, savedLogs },
        userEmail: userProfile.email
      }),
    });

    if (!response.ok) {
      throw new Error('Server response was not ok.');
    }

    console.log('Service Worker: Data synced successfully.');
    if (self.Notification && self.Notification.permission === 'granted') {
      const title = 'Absensi Online';
      const options = {
        body: 'Data Anda berhasil disinkronkan ke cloud.',
        icon: 'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png',
        tag: 'sync-notification', // Mencegah notifikasi menumpuk
        renotify: false, // Mencegah getaran/suara pada pembaruan
        silent: true // Membuatnya tidak terlalu mengganggu
      };

      // Await the notification to ensure the service worker stays alive.
      await self.registration.showNotification(title, options);
    }

  } catch (error) {
    console.error('Service Worker: Sync failed, will retry later.', error);
    // Throw an error to signal the sync manager to retry.
    throw error;
  }
}
