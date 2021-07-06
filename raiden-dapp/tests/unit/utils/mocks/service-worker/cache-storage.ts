import { MockedRequest, MockedResponse } from './';

export class MockedCacheStorage {
  private caches: { [name: string]: MockedCache } = {};

  constructor(cacheName?: string, cache?: MockedCache) {
    if (cacheName !== undefined) {
      if (cache === undefined) {
        cache = new MockedCache();
      }

      this.caches[cacheName] = cache;
    }
  }

  has = jest.fn().mockImplementation(async (name: string) => {
    return !!this.caches[name];
  });

  keys = jest.fn().mockImplementation(async () => {
    return Object.keys(this.caches);
  });

  open = jest.fn().mockImplementation(async (name: string) => {
    if (!(name in this.caches)) {
      this.caches[name] = new MockedCache();
    }

    return this.caches[name];
  });

  match = jest.fn().mockImplementation(async (request: MockedRequest) => {
    for (const cache of Object.values(this.caches)) {
      if (await cache.match(request)) {
        return true;
      }
    }

    return false;
  });

  delete = jest.fn().mockImplementation(async (name: string) => {
    delete this.caches[name];
  });
}

export class MockedCache {
  private nextId = 0;
  private data: { [id: number]: { request: MockedRequest; response: MockedResponse } } = {};

  constructor(requestUrls?: string[]) {
    (requestUrls ?? []).forEach((url) => {
      const request = new MockedRequest(url);
      const response = new MockedResponse(url);
      this.data[this.nextId] = { request, response };
      this.nextId += 1;
    });
  }

  async keys() {
    return Object.values(this.data).map((entry) => entry.request);
  }

  match = jest.fn().mockImplementation(async (request: MockedRequest) => {
    for (const entry of Object.values(this.data)) {
      if (entry.request.url == request.url) {
        return entry.response;
      }
    }
  });

  put = jest.fn().mockImplementation(async (request: MockedRequest, response: MockedResponse) => {
    this.data[this.nextId] = { request, response };
    this.nextId += 1;
  });

  delete = jest.fn().mockImplementation(async (request: MockedRequest) => {
    for (const [id, entry] of Object.entries(this.data)) {
      if (entry.request.url == request.url) {
        delete this.data[parseInt(id)];
        return true;
      }
    }

    return false;
  });
}
