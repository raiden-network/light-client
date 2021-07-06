import {
  MockedCache,
  MockedCacheStorage,
  MockedIDBDatabase,
  MockedIDBFactory,
  MockedIDBObjectStore,
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
