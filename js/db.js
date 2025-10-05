const DB_NAME = 'AbsensiAppDB';
const DB_VERSION = 2; // Bump version for schema change
const STORE_NAME = 'appState';
const QUEUE_STORE_NAME = 'offline-queue';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject("Database error: " + event.target.errorCode);

        request.onsuccess = (event) => resolve(event.target.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
                db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'key' });
            }
        };
    });
}

export const idb = {
    async get(key) {
        const db = await openDB();
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
                request.onerror = () => resolve(undefined); // On error, act as if not found
            } catch (error) {
                console.error("IDB get error:", error);
                resolve(undefined);
            }
        });
    },

    async set(key, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ key, value });
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject("Error setting data: " + event.target.errorCode);
            } catch (error) {
                 console.error("IDB set error:", error);
                 reject(error);
            }
        });
    },

    async getQueue() {
        const db = await openDB();
        return new Promise((resolve) => {
            try {
                const transaction = db.transaction(QUEUE_STORE_NAME, 'readonly');
                const store = transaction.objectStore(QUEUE_STORE_NAME);
                const request = store.get('actions');
                request.onsuccess = () => resolve(request.result ? request.result.value : []);
                request.onerror = () => resolve([]);
            } catch (error) {
                console.error("IDB getQueue error:", error);
                resolve([]);
            }
        });
    },

    async setQueue(actions) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(QUEUE_STORE_NAME, 'readwrite');
                const store = transaction.objectStore(QUEUE_STORE_NAME);
                const request = store.put({ key: 'actions', value: actions });
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject("Error setting queue: " + event.target.errorCode);
            } catch (error) {
                 console.error("IDB setQueue error:", error);
                 reject(error);
            }
        });
    }
};
