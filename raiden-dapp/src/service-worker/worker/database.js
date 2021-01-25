import { openDB } from 'idb';
import { cacheNames } from 'workbox-core';

const DATABASE_NAME = 'ServiceWorker';
const STORE_NAME = cacheNames.precache;
const PRECACHE_ENTRIES_KEY = 'precacheEntries';

async function getDatabase() {
  return await openDB(DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE_NAME);
    },
  });
}

/**
 * Saves list of precache entries to database for retrival by the next service
 * worker.
 *
 * @param precacheEntries - list of precache entries to save
 */
export async function saveToPreservePrecacheEntries(precacheEntries) {
  const database = await getDatabase();
  database.put(STORE_NAME, precacheEntries, PRECACHE_ENTRIES_KEY);
}

/**
 * Read possibly stored precache entry list from database.
 *
 * @returns precache entry list or undefined
 */
export async function getPreservedPrecacheEntries() {
  const database = await getDatabase();
  return database.get(STORE_NAME, PRECACHE_ENTRIES_KEY);
}

/**
 * Remove the list of precache entries in the database.
 */
export async function deletePreservedPrecacheEntries() {
  const database = await getDatabase();
  await database.delete(STORE_NAME, PRECACHE_ENTRIES_KEY);
}
