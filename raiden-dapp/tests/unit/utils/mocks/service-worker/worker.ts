export class MockedServiceWorker extends EventTarget implements ServiceWorker {
  public scriptURL = 'https://test.url/script.js';
  public onstatechange = null;
  public onerror = null;
  public state: ServiceWorkerState = 'activated';

  constructor() {
    super();
  }

  public postMessage = jest.fn();
}
