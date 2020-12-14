import { cacheNames } from 'workbox-core';
import { ServiceWorkerMessages } from '../messages';

export async function isAnyClientAvailble() {
  const clients = await this.clients.matchAll()
  return clients.length > 0;
};

export async function sendMessageToClients(message) {
  const clients = await this.clients.matchAll()
  clients.forEach((client) => client.postMessage(message));
};

export async function isCacheEmpty() {
  const cacheExists = await caches.has(cacheNames.precache);
  return !cacheExists;
};

export async function isCacheInvalid() {
  if (await isCacheEmpty()) {
    return true;
  }

  const cache = await caches.open(cacheNames.precache);
  const cachedRequests = await cache.keys();
  const cachedUrls = cachedRequests.map((request) => request.url);
  const expectedUrls = this.toCacheEntries.map((entry) => typeof entry === 'string' ? entry : entry.url);
  return JSON.stringify(cachedUrls) !== JSON.stringify(expectedUrls);
};

export async function update() {
  await caches.delete(cacheNames.precache);
  await sendMessageToClients.call(this, ServiceWorkerMessages.RELOAD_WINDOW);
  await this.registration.unregister();
};

export async function verifyCacheValidity() {
  if (await isCacheInvalid.call(this)) {
    sendMessageToClients.call(this, ServiceWorkerMessages.CACHE_IS_INVALID);
  }
};
