import { cacheNames } from 'workbox-core';

/**
 * Checks if the precache was already created.
 * This does not check its content nor if there is any content.
 *
 * @returns cache does not exist
 */
export async function isCacheEmpty() {
  const cacheExists = await caches.has(cacheNames.precache);
  return !cacheExists;
}
