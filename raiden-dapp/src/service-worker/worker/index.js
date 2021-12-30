/* istanbul ignore file */
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';

import {
  ServiceWorkerMessageType,
  ServiceWorkerMessageSimple,
  ServiceWorkerMessageEvent,
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

async function sendInstallationErrorMessage(error) {
  const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLATION_ERROR, {
    error,
  });

  await sendMessageToClients.call(this, message, true);
}

async function sendInstalledVersionMessage(version) {
  const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
    version,
  });

  await sendMessageToClients.call(this, message, true);
}

async function sendReloadWindowMessage() {
  const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.RELOAD_WINDOW);
  await sendMessageToClients.call(this, message, true);
}

async function sendCacheIsInvalidMessage() {
  const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.CACHE_IS_INVALID);
  await sendMessageToClients.call(this, message, true);
}

async function update() {
  await deleteCache();
  await deletePreservedPrecacheEntries();
  await this.registration.unregister();
  // Note that despite we unregistered, we can still send a message.
  await sendReloadWindowMessage.call(this);
}

async function verifyCacheValidity() {
  if (await isCacheInvalid.call(this)) {
    await sendCacheIsInvalidMessage.call(this);
  }
}

self.messageHandlers = {
  [ServiceWorkerMessageType.VERIFY_CACHE]: verifyCacheValidity,
  [ServiceWorkerMessageType.UPDATE]: update,
};

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
    this.installationError = new Error('Cache given, but precache entries are missing!');
  }
}

async function onActivate(event) {
  if (this.shouldUpdate) {
    await saveToPreservePrecacheEntries(this.precacheEntries);
    this.controller.activate(event);
  }

  await this.clients.claim();

  if (this.installationError !== undefined) {
    await sendInstallationErrorMessage.call(this, this.installationError);
  } else if (this.shouldUpdate) {
    await sendInstalledVersionMessage.call(this, process.env.PACKAGE_VERSION);
  } else {
    // For unknown reason this is necessary to prevent bugs when an old version
    // gets taken over. We were not able find the root cause, just that it works.
    await sendReloadWindowMessage.call(this);
  }
}

async function onMessage(event) {
  const message = new ServiceWorkerMessageEvent(event);
  await this.messageHandlers[message.type]?.call(this, message.payload);
}

async function onRouteError() {
  if (await isCacheInvalid.call(this)) {
    if (await isAnyClientAvailable.call(this)) {
      await sendCacheIsInvalidMessage.call(this);
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
