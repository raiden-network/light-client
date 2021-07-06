import { cacheNames } from 'workbox-core';

const DATABASE_NAME = 'ServiceWorker';
const OBJECT_STORE_NAME = cacheNames.precache;
const PRECACHE_ENTRIES_KEY = 'precacheEntries';

function resolveTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function resolveRequest(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function getDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
    request.addEventListener('upgradeneeded', async () => {
      const database = request.result;
      const objectStore = database.createObjectStore(OBJECT_STORE_NAME);
      await resolveTransaction(objectStore.transaction);
      resolve(database);
    });
  });
}

async function getPrecacheObjectStore(mode = 'readonly') {
  const database = await getDatabase();
  const transaction = database.transaction(OBJECT_STORE_NAME, mode);
  return transaction.objectStore(OBJECT_STORE_NAME);
}

/**
 * Saves list of precache entries to database for retrival by the next service
 * worker.
 *
 * @param precacheEntries - list of precache entries to save
 */
export async function saveToPreservePrecacheEntries(precacheEntries) {
  const objectStore = await getPrecacheObjectStore('readwrite');
  const request = objectStore.put(precacheEntries, PRECACHE_ENTRIES_KEY);
  await resolveRequest(request);
}

/**
 * Read possibly stored precache entry list from database.
 *
 * @returns precache entry list or undefined
 */
export async function getPreservedPrecacheEntries() {
  const objectStore = await getPrecacheObjectStore();
  const request = objectStore.get(PRECACHE_ENTRIES_KEY);
  return resolveRequest(request);
}

/**
 * Remove the list of precache entries in the database.
 */
export async function deletePreservedPrecacheEntries() {
  const objectStore = await getPrecacheObjectStore('readwrite');
  const request = objectStore.delete(PRECACHE_ENTRIES_KEY);
  await resolveRequest(request);
}
