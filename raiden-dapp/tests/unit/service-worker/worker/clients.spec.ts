import { MockedClient, MockedClients } from '../../utils/mocks';

import { ServiceWorkerMessageSimple, ServiceWorkerMessageType } from '@/service-worker/messages';
import { isAnyClientAvailable, sendMessageToClients } from '@/service-worker/worker/clients';

describe('service worker clients', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('isAnyClientAvailable', () => {
    test('is false if no client is connected at all', async () => {
      const clients = new MockedClients([]);

      await expect(isAnyClientAvailable.call({ clients })).resolves.toBeFalsy();
    });

    test('is true if one client is connected', async () => {
      const client = new MockedClient('client-id');
      const clients = new MockedClients([client]);

      await expect(isAnyClientAvailable.call({ clients })).resolves.toBeTruthy();
    });

    test('is true if multiple clients are connected', async () => {
      const clientOne = new MockedClient('client-id-one');
      const clientTwo = new MockedClient('client-id-two');
      const clients = new MockedClients([clientOne, clientTwo]);

      await expect(isAnyClientAvailable.call({ clients })).resolves.toBeTruthy();
    });
  });

  describe('sendMessageToClients()', () => {
    test('sends message to a single connected client', async () => {
      const client = new MockedClient('client-id');
      const clients = new MockedClients([client]);
      const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
        version: '1.0.0',
      });

      await sendMessageToClients.call({ clients }, message);

      expect(client.postMessage).toHaveBeenCalledTimes(1);
      expect(client.postMessage).toHaveBeenLastCalledWith({
        type: 'installed_version',
        version: '1.0.0',
      });
    });

    test('sends message to multiple connected clients', async () => {
      const clientOne = new MockedClient('client-id-one');
      const clientTwo = new MockedClient('client-id-two');
      const clients = new MockedClients([clientOne, clientTwo]);
      const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
        version: '1.0.0',
      });

      await sendMessageToClients.call({ clients }, message);

      expect(clientOne.postMessage).toHaveBeenCalledTimes(1);
      expect(clientOne.postMessage).toHaveBeenLastCalledWith({
        type: 'installed_version',
        version: '1.0.0',
      });
      expect(clientTwo.postMessage).toHaveBeenCalledTimes(1);
      expect(clientTwo.postMessage).toHaveBeenLastCalledWith({
        type: 'installed_version',
        version: '1.0.0',
      });
    });

    test('and send message to in new and old format', async () => {
      const client = new MockedClient('client-id');
      const clients = new MockedClients([client]);
      const message = new ServiceWorkerMessageSimple(ServiceWorkerMessageType.INSTALLED_VERSION, {
        version: '1.0.0',
      });

      await sendMessageToClients.call({ clients }, message, true);

      expect(client.postMessage).toHaveBeenCalledTimes(2);
      expect(client.postMessage).toHaveBeenNthCalledWith(1, {
        type: 'installed_version',
        version: '1.0.0',
      });
      expect(client.postMessage).toHaveBeenNthCalledWith(2, 'installed_version');
    });
  });
});
