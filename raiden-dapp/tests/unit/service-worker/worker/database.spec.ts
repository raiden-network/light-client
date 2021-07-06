import {
  deletePreservedPrecacheEntries,
  getPreservedPrecacheEntries,
  saveToPreservePrecacheEntries,
} from '@/service-worker/worker/database';

import {
  MockedIDBDatabase,
  MockedIDBObjectStore,
  mockIndexedDatabaseInEnvironment,
} from '../../utils/mocks/service-worker';

describe('service worker database', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('saveToPreservePrecacheEntries()', () => {
    test('uses readwrite mode to get access to the object store', async () => {
      const database = new MockedIDBDatabase();
      mockIndexedDatabaseInEnvironment({ database });

      await saveToPreservePrecacheEntries([]);

      expect(database.transaction).toHaveBeenCalledTimes(1);
      expect(database.transaction).toHaveBeenLastCalledWith('workbox-precache-v2', 'readwrite');
    });

    test('puts precache entries into object store for specific key', async () => {
      const objectStore = new MockedIDBObjectStore();
      mockIndexedDatabaseInEnvironment({ objectStore });

      await saveToPreservePrecacheEntries([{ url: 'https://test.tld/asset' }]);

      expect(objectStore.put).toHaveBeenCalledTimes(1);
      expect(objectStore.put).toHaveBeenLastCalledWith(
        [{ url: 'https://test.tld/asset' }],
        'precacheEntries',
      );
    });
  });

  describe('getPreservedPrecacheEntries', () => {
    test('uses readonly mode to get access to the object store', async () => {
      const database = new MockedIDBDatabase();
      mockIndexedDatabaseInEnvironment({ database });

      await getPreservedPrecacheEntries();

      expect(database.transaction).toHaveBeenCalledTimes(1);
      expect(database.transaction).toHaveBeenLastCalledWith('workbox-precache-v2', 'readonly');
    });

    test('gets precache entries from object store for specific key', async () => {
      const objectStore = new MockedIDBObjectStore('precacheEntries', [
        { url: 'https://test.tld/asset' },
      ]);
      mockIndexedDatabaseInEnvironment({ objectStore });

      const precacheEntries = await getPreservedPrecacheEntries();

      expect(precacheEntries).toEqual([{ url: 'https://test.tld/asset' }]);
    });
  });

  describe('deletePreservedPrecacheEntries', () => {
    test('uses readwrite mode to get access to the object store', async () => {
      const database = new MockedIDBDatabase();
      mockIndexedDatabaseInEnvironment({ database });

      await deletePreservedPrecacheEntries();

      expect(database.transaction).toHaveBeenCalledTimes(1);
      expect(database.transaction).toHaveBeenLastCalledWith('workbox-precache-v2', 'readwrite');
    });

    test('deletes precache entries from object store for specific key', async () => {
      const objectStore = new MockedIDBObjectStore();
      mockIndexedDatabaseInEnvironment({ objectStore });

      await deletePreservedPrecacheEntries();

      expect(objectStore.delete).toHaveBeenCalledTimes(1);
      expect(objectStore.delete).toHaveBeenLastCalledWith('precacheEntries');
    });
  });
});
