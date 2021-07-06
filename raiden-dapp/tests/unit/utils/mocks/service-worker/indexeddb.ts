export class MockedIDBFactory {
  private databases: { [name: string]: MockedIDBDatabase } = {};

  constructor(databaseName?: string, database?: MockedIDBDatabase) {
    if (databaseName && database) {
      this.databases[databaseName] = database;
    }
  }

  open = jest.fn().mockImplementation((name: string) => {
    if (!(name in this.databases)) {
      this.databases[name] = new MockedIDBDatabase();
    }

    return new MockedIDBRequest(this.databases[name]);
  });
}

export class MockedIDBRequest extends EventTarget {
  readonly result: unknown | undefined;

  constructor(result?: unknown) {
    super();
    this.result = result;
  }

  addEventListener(type: string, callback: (event: Event) => void): void {
    super.addEventListener(type, callback);
    const event = new Event(type);
    setTimeout(() => this.dispatchEvent(event), 10);
  }
}

export class MockedIDBDatabase {
  private objectStores: { [name: string]: MockedIDBObjectStore } = {};

  constructor(objectStoreName?: string, objectStore?: MockedIDBObjectStore) {
    if (objectStoreName && objectStore) {
      this.objectStores[objectStoreName] = objectStore;
    }
  }

  createObjectStore = jest.fn().mockImplementation(() => {
    return new MockedIDBObjectStore();
  });

  transaction = jest.fn().mockImplementation((objectStoreName: string) => {
    if (!(objectStoreName in this.objectStores)) {
      this.objectStores[objectStoreName] = new MockedIDBObjectStore();
    }

    const objectStore = () => this.objectStores[objectStoreName];
    return { objectStore };
  });
}

export class MockedIDBObjectStore {
  private data: { [key: string]: unknown } = {};
  protected transaction: MockedIDBTransaction;

  constructor(key?: string, value?: unknown) {
    if (key && value) {
      this.data[key] = value;
    }

    this.transaction = new MockedIDBTransaction();
  }

  put = jest.fn().mockImplementation((value: unknown, key: string) => {
    this.data[key] = value;
    return new MockedIDBRequest();
  });

  get = jest.fn().mockImplementation((key: string) => {
    return new MockedIDBRequest(this.data[key]);
  });

  delete = jest.fn().mockImplementation((key: string) => {
    delete this.data[key];
    return new MockedIDBRequest();
  });
}

export class MockedIDBTransaction extends MockedIDBRequest {
  constructor() {
    super();
  }
}
