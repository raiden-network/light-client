export class MockedServiceWorkerRegistration
  extends EventTarget
  implements ServiceWorkerRegistration
{
  public readonly scope = 'testScope';
  public readonly installing = null;
  public readonly waiting = null;
  public readonly active = null;
  public readonly navigationPreload = null;
  public readonly pushManager = {} as unknown as PushManager;
  public readonly sync = null;
  public readonly index = null;
  public readonly onupdatefound = null;

  constructor() {
    super();
  }

  public getNotifications = jest.fn();
  public showNotification = jest.fn();
  public update = jest.fn();
  public unregister = jest.fn();
  public updateViaCache: ServiceWorkerUpdateViaCache = 'none';
}
