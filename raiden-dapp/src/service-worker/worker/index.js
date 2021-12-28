/* istanbul ignore file */
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';

import {
  ServiceWorkerMessageIdentifier,
  ServiceWorkerAssistantMessageIdentifier,
} from '../messages';

import {
  getPreservedPrecacheEntries,
  saveToPreservePrecacheEntries,
  deletePreservedPrecacheEntries,
} from './database';
import { isAnyClientAvailable, sendMessageToClients } from './clients';
import { doesCacheExist, isCacheInvalid, deleteCache } from './cache';

self.controller = new PrecacheController({ fallbackToNetwork: false });
self.route = new PrecacheRoute(self.controller);

async function update() {
  await deleteCache();
  await deletePreservedPrecacheEntries();
  await this.registration.unregister();
  // Note that despite we unregistered, we can still send a message.
  await sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.RELOAD_WINDOW);
}

async function verifyCacheValidity() {
  if (await isCacheInvalid.call(this)) {
    sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.CACHE_IS_INVALID);
  }
}

async function onInstall(event) {
  const cacheExists = await doesCacheExist();
  const preservedPrecacheEntries = await getPreservedPrecacheEntries();

  if (!cacheExists) {
    this.shouldUpdate = true;
    this.precacheEntries = self.__WB_PRECACHE_ENTRIES;
    this.controller.addToCacheList(this.precacheEntries);
    this.controller.install(event);
  } else if (cacheExists && preservedPrecacheEntries) {
    this.shouldUpdate = false;
    this.precacheEntries = preservedPrecacheEntries;
    this.controller.addToCacheList(this.precacheEntries);
  } else {
    this.installError = new Error('Cache given, but precache entries are missing!');
  }
}

async function onActivate(event) {
  if (this.shouldUpdate) {
    await saveToPreservePrecacheEntries(this.precacheEntries);
    this.controller.activate(event);
  }

  await this.clients.claim();

  if (this.installError !== undefined) {
    sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.INSTALLATION_ERROR, {
      error: this.installError,
    });
  } else if (this.shouldUpdate) {
    sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.INSTALLED_VERSION, {
      version: process.env.PACKAGE_VERSION,
    });
  } else {
    // For unknown reason this is necessary to prevent bugs when an old version
    // gets taken over. We were not able find the root cause, just that it works.
    await sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.RELOAD_WINDOW);
  }
}

async function onMessage(event) {
  if (!(event.data && event.data.messageIdentifier)) return;

  const { messageIdentifier } = event.data;

  switch (messageIdentifier) {
    case ServiceWorkerAssistantMessageIdentifier.UPDATE:
      await update.call(this);
      break;

    case ServiceWorkerAssistantMessageIdentifier.VERIFY_CACHE:
      await verifyCacheValidity.call(this);
      break;

    default:
      break;
  }
}

async function onRouteError() {
  if (await isCacheInvalid.call(this)) {
    if (await isAnyClientAvailable.call(this)) {
      sendMessageToClients.call(this, ServiceWorkerMessageIdentifier.CACHE_IS_INVALID);
    } else {
      update.call(this);
      // Note that the user now has to reload the page himself. Since there is
      // no client available, nobody can reload the page automatically.
    }
  }

  return Response.error();
}

self.addEventListener('install', (event) => event.waitUntil(onInstall.call(self, event)));
self.addEventListener('activate', (event) => event.waitUntil(onActivate.call(self, event)));
self.addEventListener('message', (event) => event.waitUntil(onMessage.call(self, event)));

registerRoute(self.route.match, self.route.handler); // TODO: Why can't we pass the route directly?
setCatchHandler(onRouteError.bind(self));
