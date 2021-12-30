import {
  MockedCache,
  MockedCacheStorage,
  MockedClient,
  MockedClients,
  MockedExtendableEvent,
  MockedFetchEvent,
  MockedIDBFactory,
  MockedIDBObjectStore,
  MockedMessageEvent,
  MockedRequest,
  MockedServiceWorkerRegistration,
  mockEnvironmentForServiceWorker,
} from '../../utils/mocks';

async function installServiceWorker(context: EventTarget): Promise<void> {
  require('@/service-worker/worker');

  const installEvent = new MockedExtendableEvent('install');
  context.dispatchEvent(installEvent);
  await installEvent.waitToFinish();
}

async function activateServiceWorker(context: EventTarget): Promise<void> {
  const activateEvent = new MockedExtendableEvent('activate');
  context.dispatchEvent(activateEvent);
  await activateEvent.waitToFinish();
}

async function installAndActivateServiceWorker(context: EventTarget): Promise<void> {
  await installServiceWorker(context);
  await activateServiceWorker(context);
}

async function sendMessageFromAssistantToServiceWorker(
  context: EventTarget,
  message: unknown,
  installServiceWorker = true,
): Promise<void> {
  if (installServiceWorker) {
    await installAndActivateServiceWorker(context);
  }

  jest.clearAllMocks(); // Forget recorded data of previous installation and activation steps.
  const messageEvent = new MockedMessageEvent('message', message);
  context.dispatchEvent(messageEvent);
  await messageEvent.waitToFinish();
}

async function fetchUrlViaServiceWorker(
  context: EventTarget,
  url: string,
  installServiceWorker = true,
): Promise<MockedFetchEvent> {
  if (installServiceWorker) {
    await installAndActivateServiceWorker(context);
  }

  jest.clearAllMocks(); // Forget recorded data of previous installation and activation steps.
  const fetchEvent = new MockedFetchEvent('fetch', url);
  context.dispatchEvent(fetchEvent);
  await fetchEvent.waitToFinish();
  await new Promise((resolve) => setTimeout(resolve, 50)); // For some rason this is necessary...
  return fetchEvent;
}

describe('service worker index', () => {
  beforeEach(() => {
    jest.resetModules(); // Required so that the service worker script does not get cached.
    jest.restoreAllMocks();
    process.env.PACKAGE_VERSION = '2.0.0';
  });

  afterEach(() => {
    delete process.env.PACKAGE_VERSION;
  });

  describe('installation and activation phases', () => {
    test('saves the precache entries to cache if cache and database are empty', async () => {
      const cache = new MockedCache([]);
      const indexedDB = new MockedIDBFactory();
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ cache, indexedDB, precacheEntries });

      await installServiceWorker(context);

      expect(cache.put).toHaveBeenCalledTimes(1);
      expect(cache.put.mock.calls.map((call) => call[0].url)).toEqual([
        'https://test.tld/asset?__WB_REVISION__=1',
      ]);
    });

    test('saves the precache entries to database if cache and database are empty', async () => {
      const cache = new MockedCache([]);
      const objectStore = new MockedIDBObjectStore();
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ cache, objectStore, precacheEntries });

      await installAndActivateServiceWorker(context);

      expect(objectStore.put).toHaveBeenCalledTimes(1);
      expect(objectStore.put).toHaveBeenLastCalledWith(
        [{ url: 'https://test.tld/asset', revision: '1' }],
        'precacheEntries',
      );
    });

    test('takes over previous cache if finding the precache entries in database', async () => {
      const cache = new MockedCache(['https://test.tld/old-asset']);
      const objectStore = new MockedIDBObjectStore('precacheEntries', [
        { url: 'https://test.tld/old-asset' },
      ]);
      const context = mockEnvironmentForServiceWorker({ cache, objectStore });

      await installAndActivateServiceWorker(context);

      expect(cache.put).not.toHaveBeenCalled();
      expect(objectStore.put).not.toHaveBeenCalled();
    });

    test('sends installed version message when activation completed after update', async () => {
      const cache = new MockedCache([]);
      const client = new MockedClient();
      const indexedDB = new MockedIDBFactory();
      const context = mockEnvironmentForServiceWorker({ cache, client, indexedDB });

      await installAndActivateServiceWorker(context);

      expect(client.postMessage).toHaveBeenCalledTimes(2);
      expect(client.postMessage).toHaveBeenNthCalledWith(1, {
        type: 'installed_version',
        version: '2.0.0',
      });
      expect(client.postMessage).toHaveBeenNthCalledWith(2, 'installed_version');
    });

    test('sends window reload message after activation if taking over old version', async () => {
      const cache = new MockedCache(['https://test.tld/old-asset']);
      const client = new MockedClient();
      const objectStore = new MockedIDBObjectStore('precacheEntries', [
        { url: 'https://test.tld/old-asset' },
      ]);
      const context = mockEnvironmentForServiceWorker({ cache, client, objectStore });

      await installServiceWorker(context);
      expect(client.postMessage).not.toHaveBeenCalled();

      await activateServiceWorker(context);
      expect(client.postMessage).toHaveBeenCalledTimes(2);
      expect(client.postMessage).toHaveBeenNthCalledWith(1, { type: 'reload_window' });
      expect(client.postMessage).toHaveBeenNthCalledWith(2, 'reload_window');
    });

    test('takes control of all clients when getting activated', async () => {
      const clients = new MockedClients();
      const context = mockEnvironmentForServiceWorker({ clients });

      await installServiceWorker(context);
      expect(clients.claim).not.toHaveBeenCalled();

      await activateServiceWorker(context);
      expect(clients.claim).toHaveBeenCalledTimes(1);
    });

    test('sends installation error message to clients if cache exists but no database', async () => {
      const cache = new MockedCache(['https://test.tls/asset']);
      const client = new MockedClient();
      const indexedDB = new MockedIDBFactory();
      const context = mockEnvironmentForServiceWorker({ cache, client, indexedDB });

      await installAndActivateServiceWorker(context);

      expect(client.postMessage).toHaveBeenCalledTimes(2);
      expect(client.postMessage).toHaveBeenNthCalledWith(1, {
        type: 'installation_error',
        error: new Error('Cache given, but precache entries are missing!'),
      });
      expect(client.postMessage).toHaveBeenNthCalledWith(2, 'installation_error');
    });
  });

  describe('acts on fetch requests of client', () => {
    test('replies with cached responses for requests in pre-cache entries', async () => {
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ precacheEntries });

      const fetchEvent = await fetchUrlViaServiceWorker(context, 'https://test.tld/asset');

      expect(fetchEvent.respondWith).toHaveBeenCalledTimes(1);
      expect(fetchEvent.respondWith).toHaveBeenLastCalledWith(expect.any(Object));
    });

    test('ignores requests not in pre-cache entries', async () => {
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ precacheEntries });

      const fetchEvent = await fetchUrlViaServiceWorker(context, 'https://something-else.tld');

      expect(fetchEvent.respondWith).not.toHaveBeenCalled();
    });

    test('can serve from cache of old version', async () => {
      const cache = new MockedCache(['https://test.tld/old-asset']);
      const objectStore = new MockedIDBObjectStore('precacheEntries', [
        { url: 'https://test.tld/old-asset' },
      ]);
      const precacheEntries = [{ url: 'https://test.tld/new-asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ cache, objectStore, precacheEntries });

      let fetchEvent = await fetchUrlViaServiceWorker(context, 'https://test.tld/old-asset');
      expect(fetchEvent.respondWith).toHaveBeenCalledTimes(1);
      expect(fetchEvent.respondWith).toHaveBeenLastCalledWith(expect.any(Object));

      fetchEvent = await fetchUrlViaServiceWorker(context, 'https://test.tld/new-asset');
      expect(fetchEvent.respondWith).not.toHaveBeenCalled();
    });
  });

  describe.each(['update', { type: 'update' }])(
    'on update message (message format: %j)',
    (message) => {
      test('deletes cache for current version', async () => {
        const caches = new MockedCacheStorage();
        const context = mockEnvironmentForServiceWorker({ caches });

        await sendMessageFromAssistantToServiceWorker(context, message);

        expect(caches.delete).toHaveBeenCalledTimes(1);
        expect(caches.delete).toHaveBeenLastCalledWith('workbox-precache-v2');
      });

      test('deletes database precache-entries', async () => {
        const objectStore = new MockedIDBObjectStore('precacheEntries', []);
        const context = mockEnvironmentForServiceWorker({ objectStore });

        await sendMessageFromAssistantToServiceWorker(context, message);

        expect(objectStore.delete).toHaveBeenCalledTimes(1);
        expect(objectStore.delete).toHaveBeenLastCalledWith('precacheEntries');
      });

      test('unregisters itself', async () => {
        const registration = new MockedServiceWorkerRegistration();
        const context = mockEnvironmentForServiceWorker({ registration });

        await sendMessageFromAssistantToServiceWorker(context, message);

        expect(registration.unregister).toHaveBeenCalledTimes(1);
      });

      test('sends window reload message', async () => {
        const client = new MockedClient();
        const context = mockEnvironmentForServiceWorker({ client });

        await sendMessageFromAssistantToServiceWorker(context, message);

        expect(client.postMessage).toHaveBeenCalledTimes(2);
        expect(client.postMessage).toHaveBeenNthCalledWith(1, { type: 'reload_window' });
        expect(client.postMessage).toHaveBeenNthCalledWith(2, 'reload_window');
      });
    },
  );

  describe.each(['verify_cache', { type: 'verify_cache' }])(
    'on verify cache message (message format: %j)',
    (message) => {
      test('sends cache is invalid message if cache does not exist', async () => {
        const caches = new MockedCacheStorage();
        const client = new MockedClient();
        const context = mockEnvironmentForServiceWorker({ caches, client });
        await installAndActivateServiceWorker(context);

        await caches.delete('workbox-precache-v2');
        await sendMessageFromAssistantToServiceWorker(context, message, false);

        expect(client.postMessage).toHaveBeenCalledTimes(2);
        expect(client.postMessage).toHaveBeenNthCalledWith(1, { type: 'cache_is_invalid' });
        expect(client.postMessage).toHaveBeenNthCalledWith(2, 'cache_is_invalid');
      });

      test('sends cache is invalid message if cache is missing an entry', async () => {
        const cache = new MockedCache();
        const client = new MockedClient();
        const precacheEntries = [
          { url: 'https://test.tld/asset-one', revision: '1' },
          { url: 'https://test.tld/asset-two', revision: '1' },
        ];
        const context = mockEnvironmentForServiceWorker({ cache, client, precacheEntries });
        await installAndActivateServiceWorker(context);

        await cache.delete(new MockedRequest('https://test.tld/asset-one?__WB_REVISION__=1'));
        await sendMessageFromAssistantToServiceWorker(context, message);

        expect(client.postMessage).toHaveBeenCalledTimes(2);
        expect(client.postMessage).toHaveBeenNthCalledWith(1, { type: 'cache_is_invalid' });
        expect(client.postMessage).toHaveBeenNthCalledWith(2, 'cache_is_invalid');
      });
    },
  );

  describe('on routing errors', () => {
    test('sends cache is invalid message if detecting invalid cache and a client is available', async () => {
      const client = new MockedClient();
      const cache = new MockedCache();
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({ client, cache, precacheEntries });
      await installAndActivateServiceWorker(context);

      await cache.delete(new MockedRequest('https://test.tld/asset?__WB_REVISION__=1'));
      await fetchUrlViaServiceWorker(context, 'https://test.tld/asset', false);

      expect(client.postMessage).toHaveBeenCalledTimes(2);
      expect(client.postMessage).toHaveBeenNthCalledWith(1, { type: 'cache_is_invalid' });
      expect(client.postMessage).toHaveBeenNthCalledWith(2, 'cache_is_invalid');
    });

    test('initates update if detecting invalid cache and no client is available', async () => {
      const cache = new MockedCache();
      const caches = new MockedCacheStorage('workbox-precache-v2', cache);
      const clients = new MockedClients([]);
      const objectStore = new MockedIDBObjectStore('precacheEntries', []);
      const registration = new MockedServiceWorkerRegistration();
      const precacheEntries = [{ url: 'https://test.tld/asset', revision: '1' }];
      const context = mockEnvironmentForServiceWorker({
        caches,
        clients,
        objectStore,
        registration,
        precacheEntries,
      });
      await installAndActivateServiceWorker(context);

      await cache.delete(new MockedRequest('https://test.tld/asset?__WB_REVISION__=1'));
      await fetchUrlViaServiceWorker(context, 'https://test.tld/asset', false);

      // Only check some basics of absolute required actions. We have detailed
      // tests for full updates.
      expect(caches.delete).toHaveBeenCalledTimes(1);
      expect(caches.delete).toHaveBeenLastCalledWith('workbox-precache-v2');
      expect(objectStore.delete).toHaveBeenCalledTimes(1);
      expect(objectStore.delete).toHaveBeenLastCalledWith('precacheEntries');
      expect(registration.unregister).toHaveBeenCalledTimes(1);
    });
  });
});
