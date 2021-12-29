import { MockedServiceWorkerRegistration } from './registration';
import { MockedServiceWorker } from './worker';

export class MockedServiceWorkerContainer extends EventTarget implements ServiceWorkerContainer {
  public onmessage = null;
  public onmessageerror = null;
  public oncontrollerchange = null;
  public onstatechange = null;

  public scriptURL = null;
  public readonly controller: ServiceWorker;

  private registrations: ServiceWorkerRegistration[];

  constructor(options?: {
    serviceWorker?: ServiceWorker;
    serviceWorkerRegistrations?: ServiceWorkerRegistration[];
  }) {
    super();
    this.controller = options?.serviceWorker ?? new MockedServiceWorker();
    this.registrations = options?.serviceWorkerRegistrations ?? [];
  }

  public readonly ready: Promise<ServiceWorkerRegistration> = new Promise((resolve) =>
    resolve(this.registrations?.[0] ?? new MockedServiceWorkerRegistration()),
  );

  public register = jest.fn();
  public getRegistration = jest.fn(async () => this.registrations?.[0]);
  public getRegistrations = jest.fn(async () => this.registrations);
  public startMessages = jest.fn();
}
