import {
  MockedIDBFactory,
  MockedIDBDatabase,
  MockedIDBObjectStore,
} from './';

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
