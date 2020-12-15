/* istanbul ignore file */
import { cacheNames } from 'workbox-core';
import { ServiceWorkerMessages } from '../messages';

/**
 * Checks if the service worker is contralling any client.
 *
 * @returns boolean if there is a connected client
 */
export async function isAnyClientAvailable() {
  const clients = await this.clients.matchAll();
  return clients.length > 0;
}

/**
 * Send a given message to all clients the service worker controls.
 *
 * @param message - data of the message event to send
 */
export async function sendMessageToClients(message) {
  const clients = await this.clients.matchAll();
  clients.forEach((client) => client.postMessage(message));
}

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

/**
 * Performs a check of the current cache content in comparison to the expeceted
 * initial precache assets.
 * The cache is valid if the cache itself was created and if each asset that is
 * expected to be cached can be find within the cache.
 *
 * @returns boolean if the cache is evaluated as valid
 */
export async function isCacheInvalid() {
  if (await isCacheEmpty()) {
    return true;
  }

  const cache = await caches.open(cacheNames.precache);
  const cachedRequests = await cache.keys();
  const cachedKeys = cachedRequests.map((request) => request.url);
  const expectedKeys = Array.from(this.controller._urlsToCacheKeys.values()); // Accessing "private" property, but it saves a lot of computation power.
  return !expectedKeys.every((key) => cachedKeys.includes(key));
}

/**
 * Prepares everything to let the client update the preached version.
 * Therefore it deletes the current cache, which will cause the next service
 * worker to download the most recent version.
 * Then it signals the assistant that the window should be reloaded. Afterwards
 * it unregister itself. The assistant is delaying the reload so that this
 * service worker is unregistered before. This will cause the web-browser on the
 * next load to install the next service worker right away. That one will then
 * install the most recent version because it recognizes an empty cache.
 */
export async function update() {
  await caches.delete(cacheNames.precache);
  await sendMessageToClients.call(this, ServiceWorkerMessages.RELOAD_WINDOW);
  await this.registration.unregister();
}
