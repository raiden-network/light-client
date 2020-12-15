/* istanbul ignore file */
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { ServiceWorkerMessages, ServiceWorkerAssistantMessages } from '../messages';
import {
  isCacheEmpty,
  isCacheInvalid,
  isAnyClientAvailable,
  update,
  verifyCacheValidity,
  sendMessageToClients,
} from './utilities';

async function onInstall(event) {
  this.initialCacheWasEmpty = await isCacheEmpty();

  // Do not update if there is still a(n old) version cached.
  if (this.initialCacheWasEmpty) {
    this.controller.install(event);
  }
}

async function onActivate(event) {
  if (this.initialCacheWasEmpty) {
    this.controller.activate(event);
  }

  await this.clients.claim();
}

async function onMessage(event) {
  if (!event.data) return;

  switch (event.data) {
    case ServiceWorkerAssistantMessages.UPDATE:
      await update.call(this);
      break;

    case ServiceWorkerAssistantMessages.VERIFY_CACHE:
      await verifyCacheValidity.call(this);
      break;

    default:
      break;
  }
}

async function onRouteError() {
  if (await isCacheInvalid.call(this)) {
    if (await isAnyClientAvailable.call(this)) {
      sendMessageToClients.call(this, ServiceWorkerMessages.CACHE_IS_INVALID);
    } else {
      update.call(this);
      // Note that the user now has to reload the page himself. Since there is
      // no client available, nobody can reload the page automatically.
    }
  }

  return Response.error();
}

self.initialCacheWasEmpty = false; // Be pessimistic to prevent uninteded updates.
self.toCacheEntries = self.__WB_MANIFEST; // Workaround since it is allowed to use the manifest only once.
self.controller = new PrecacheController({ fallbackToNetwork: false });
self.controller.addToCacheList(self.toCacheEntries);
self.route = new PrecacheRoute(self.controller);

self.oninstall = (event) => event.waitUntil(onInstall.call(self, event));
self.onactivate = (event) => event.waitUntil(onActivate.call(self, event));
self.onmessage = (event) => event.waitUntil(onMessage.call(self, event));

registerRoute(self.route.match, self.route.handler); // TODO: Why can't we pass the route directly?
setCatchHandler(onRouteError.bind(self));
