import { cacheNames } from 'workbox-core';

/**
 * Checks if the cache was already created and is not empty.
 *
 * @returns cache does exist and is not empty
 */
export async function doesCacheExist() {
  if (await caches.has(cacheNames.precache)) {
    const cache = await caches.open(cacheNames.precache);
    const keys = await cache.keys();
    return keys.length > 0;
  } else {
    return false;
  }
}

/**
 * Performs a check of the current cache content in comparison to the expeceted
 * initial precache assets.
 * The cache is valid if the cache itself was created and if each asset that is
 * expected to be cached can be find within the cache.
 *
 * Requires to be bound to the service worker context!
 *
 * @returns boolean if the cache is evaluated as valid
 */
export async function isCacheInvalid() {
  if (!(await caches.has(cacheNames.precache))) {
    return true;
  }

  const cache = await caches.open(cacheNames.precache);
  const cachedRequests = await cache.keys();
  const cachedKeys = cachedRequests.map((request) => request.url);
  const expectedKeys = Array.from(this.controller._urlsToCacheKeys.values()); // Accessing "private" property, but it saves a lot of computation power.
  return !expectedKeys.every((key) => cachedKeys.includes(key));
}

/**
 * Delete the cache with all its content
 * Used to prepare an update by the next sevice worker.
 */
export async function deleteCache() {
  await caches.delete(cacheNames.precache);
}
