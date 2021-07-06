import {
  MockedCache,
  MockedCacheStorage,
  MockedClient,
  MockedClients,
  MockedExtendableEvent,
  mockedFetch,
  MockedFetchEvent,
  MockedIDBDatabase,
  MockedIDBFactory,
  MockedIDBObjectStore,
  MockedRegistration,
  MockedRequest,
  MockedResponse,
} from './';

type CacheStorageEnvironment = {
  cache: MockedCache;
  caches: MockedCacheStorage;
};

/**
 * Please make sure to call `jest.restoreAllMocks()` to "tear down" the
 * environment again.
 *
 * @param environment - set of particular instances to use for environment
 * @returns final environment as mocked
 */
export function mockCacheStorageInEnvironment(
  environment?: Partial<CacheStorageEnvironment>,
): CacheStorageEnvironment {
  const cache = environment?.cache ?? new MockedCache();
  const caches = environment?.caches ?? new MockedCacheStorage('workbox-precache-v2', cache);

  Object.defineProperty(global, 'caches', {
    configurable: true,
    get: () => undefined,
  });

  const cachesGetSpy = jest.spyOn(global, 'caches', 'get');
  cachesGetSpy.mockReturnValue(caches);

  return { cache, caches };
}

type IndexedDatabaseEnvironment = {
  objectStore: MockedIDBObjectStore;
  database: MockedIDBDatabase;
  indexedDB: MockedIDBFactory;
};

/**
 * Please make sure to call `jest.restoreAllMocks()` to "tear down" the
 * environment again.
 *
 * @param environment - set of particular instances to use for environment
 * @returns final environment as mocked
 */
export function mockIndexedDatabaseInEnvironment(
  environment?: Partial<IndexedDatabaseEnvironment>,
): IndexedDatabaseEnvironment {
  const objectStore = environment?.objectStore ?? new MockedIDBObjectStore();
  const database =
    environment?.database ?? new MockedIDBDatabase('workbox-precache-v2', objectStore);
  const indexedDB = environment?.indexedDB ?? new MockedIDBFactory('ServiceWorker', database);

  Object.assign(global, { indexedDB, IDBObjectStore: MockedIDBObjectStore });

  return { objectStore, database, indexedDB };
}

type ServiceWorkerEnvironment = CacheStorageEnvironment &
  IndexedDatabaseEnvironment & {
    client: MockedClient;
    clients: MockedClients;
    registration: MockedRegistration;
    manifest: { url: string; revision?: string }[];
  };

/**
 * Adds all necessary APIs, classes and more to the environment as it would look
 * like for a service worker thread in the browser. Allows to provide particular
 * instances of the implementations for testing control.
 *
 * Please make sure to call `jest.restoreAllMocks()` to "tear down" the
 * environment again.
 *
 * @param environment - set of particular instances to use for environment
 * @returns context - the service worker will get bound to (can be used to dispatch
 * events)
 */
export function mockEnvironmentForServiceWorker(
  environment?: Partial<ServiceWorkerEnvironment>,
): EventTarget {
  const client = environment?.client ?? new MockedClient();
  const clients = environment?.clients ?? new MockedClients([client]);
  const manifest = environment?.manifest ?? [];
  const registration = environment?.registration ?? new MockedRegistration();
  const context = new EventTarget();
  const { caches } = mockCacheStorageInEnvironment({ ...environment });
  mockIndexedDatabaseInEnvironment({ ...environment });

  Object.assign(global, {
    fetch: mockedFetch,
    Request: MockedRequest,
    FetchEvent: MockedFetchEvent,
    ExtendableEvent: MockedExtendableEvent,
    Response: MockedResponse,
  });

  Object.assign(context, {
    caches,
    clients,
    registration,
    __WB_MANIFEST: manifest,
    __WB_DISABLE_DEV_LOGS: true, // Can be temporally enabled for debugging purposes.
  });

  const contextGetSpy = jest.spyOn(global, 'self', 'get');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contextGetSpy.mockReturnValue(context as any);

  return context;
}
