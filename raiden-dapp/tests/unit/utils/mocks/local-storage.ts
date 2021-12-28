export class MockedLocalStorage implements Storage {
  public data: Record<string, string> = {};

  constructor(data: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(data)) {
      this.data[key] = JSON.stringify(value);
    }
  }

  getItem = jest.fn((key: string): string | null => {
    return this.data[key] ?? null;
  });

  setItem = jest.fn((key: string, value: string): void => {
    this.data[key] = value;
  });

  removeItem = jest.fn((key: string): void => {
    delete this.data[key];
  });

  key = jest.fn();
  lock = jest.fn();
  clear = jest.fn();
  length = 0;
}
