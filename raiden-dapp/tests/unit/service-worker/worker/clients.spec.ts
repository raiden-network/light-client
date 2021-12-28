import { MockedClient, MockedClients } from '../../utils/mocks';

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

      await sendMessageToClients.call({ clients }, 'testIdentifier', { data: 1 });

      expect(client.postMessage).toHaveBeenCalledTimes(1);
      expect(client.postMessage).toHaveBeenLastCalledWith({
        messageIdentifier: 'testIdentifier',
        data: 1,
      });
    });

    test('sends message to multiple connected clients', async () => {
      const clientOne = new MockedClient('client-id-one');
      const clientTwo = new MockedClient('client-id-two');
      const clients = new MockedClients([clientOne, clientTwo]);

      await sendMessageToClients.call({ clients }, 'testIdentifier', { data: 1 });

      expect(clientOne.postMessage).toHaveBeenCalledTimes(1);
      expect(clientOne.postMessage).toHaveBeenLastCalledWith({
        messageIdentifier: 'testIdentifier',
        data: 1,
      });
      expect(clientTwo.postMessage).toHaveBeenCalledTimes(1);
      expect(clientTwo.postMessage).toHaveBeenLastCalledWith({
        messageIdentifier: 'testIdentifier',
        data: 1,
      });
    });
  });
});
