/* istanbul ignore file */
import { cacheNames } from 'workbox-core';
import { ServiceWorkerMessages } from '../messages';

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
