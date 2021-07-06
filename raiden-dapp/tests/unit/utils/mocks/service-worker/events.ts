import { MockedRequest } from './';

export class MockedExtendableEvent extends Event {
  private extendLifetimePromises: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.extendLifetimePromises.push(promise);
  }

  // Note that new promises can be added while the current one is still about to
  // get resolved. This is important to be handled.
  async waitToFinish(): Promise<void> {
    let promise;

    while ((promise = this.extendLifetimePromises.pop())) {
      await promise;
    }
  }
}

export class MockedMessageEvent extends MockedExtendableEvent {
  constructor(type: string, data?: unknown) {
    super(type);
    Object.assign(this, { data });
  }
}

export class MockedFetchEvent extends MockedExtendableEvent {
  public request: MockedRequest;

  constructor(type: string, url: string) {
    super(type);
    this.request = new MockedRequest(url);
  }

  respondWith = jest.fn();
}
