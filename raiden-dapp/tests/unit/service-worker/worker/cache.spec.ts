import { mockCacheStorageInEnvironment, MockedCache, MockedCacheStorage } from '../../utils/mocks';

import { PrecacheController } from 'workbox-precaching';

import { deleteCache, doesCacheExist, isCacheInvalid } from '@/service-worker/worker/cache';

describe('service worker cache', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('doesCacheExist()', () => {
    test('is false if specific cache does not exist', async () => {
      const caches = new MockedCacheStorage('other-cache');
      mockCacheStorageInEnvironment({ caches });

      const exists = await doesCacheExist();

      expect(exists).toBeFalsy();
    });

    test('is false if specific cache does exist but is empty', async () => {
      const cache = new MockedCache([]);
      const caches = new MockedCacheStorage('workbox-precache-v2', cache);
      mockCacheStorageInEnvironment({ caches });

      const exists = await doesCacheExist();

      expect(exists).toBeFalsy();
    });

    test('is true if specific cache exists and is not empty', async () => {
      const cache = new MockedCache(['https://test.tld/asset']);
      mockCacheStorageInEnvironment({ cache });

      const exists = await doesCacheExist();

      expect(exists).toBeTruthy();
    });
  });

  describe('isCacheInvalid()', () => {
    test('is invalid if the specific cache does not exist', async () => {
      const caches = new MockedCacheStorage('other-cache');
      mockCacheStorageInEnvironment({ caches });

      const isInvalid = await isCacheInvalid();

      expect(isInvalid).toBeTruthy();
    });

    test('is invalid if the cache is empty', async () => {
      const cache = new MockedCache([]);
      const caches = new MockedCacheStorage('workbox-precache-v2', cache);
      mockCacheStorageInEnvironment({ caches });

      const controller = new PrecacheController();
      controller.addToCacheList([{ url: 'https://test.tld/asset', revision: '1' }]);

      const isInvalid = await isCacheInvalid.call({ controller });

      expect(isInvalid).toBeTruthy();
    });

    test('is invalid if a cache entry is missing', async () => {
      const cache = new MockedCache(['https://test.tld/asset-one?__WB_REVISION__=1']);
      mockCacheStorageInEnvironment({ cache });

      const controller = new PrecacheController();
      controller.addToCacheList([
        { url: 'https://test.tld/asset-one', revision: '1' },
        { url: 'https://test.tld/asset-two', revision: '1' },
      ]);

      const isInvalid = await isCacheInvalid.call({ controller });

      expect(isInvalid).toBeTruthy();
    });

    test('is valid if all cache entries are there', async () => {
      const cache = new MockedCache(['https://test.tld/asset?__WB_REVISION__=1']);
      mockCacheStorageInEnvironment({ cache });

      const controller = new PrecacheController();
      controller.addToCacheList([{ url: 'https://test.tld/asset', revision: '1' }]);

      const isInvalid = await isCacheInvalid.call({ controller });

      expect(isInvalid).toBeFalsy();
    });
  });

  describe('deleteCache()', () => {
    test('deletes specific cache', async () => {
      const caches = new MockedCacheStorage('workbox-precache-v2');
      mockCacheStorageInEnvironment({ caches });

      await deleteCache();

      expect(caches.delete).toHaveBeenCalledTimes(1);
      expect(caches.delete).toHaveBeenLastCalledWith('workbox-precache-v2');
    });
  });
});
