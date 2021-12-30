import {
  MockedServiceWorker,
  MockedServiceWorkerContainer,
  MockedServiceWorkerRegistration,
} from '../utils/mocks';

import { createLocalVue } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vuex, { Store } from 'vuex';

import ServiceWorkerAssistant from '@/service-worker/assistant';
import type { RootStateWithVersionInformation } from '@/store/version-information';

const localVue = createLocalVue();
localVue.use(Vuex);

async function sleep(duration: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, duration));
}

async function respondWithServerVersion(this: string | null): Promise<Response> {
  const parseJson = () =>
    new Promise((resolve, reject) => {
      if (this === null) {
        reject('Failed to parse json');
      } else {
        const data = { version: { version: this } };
        resolve(data);
      }
    });

  return { json: parseJson } as Response;
}

function sendMessageFromServiceWorkerToAssistant(
  serviceWorkerContainer: ServiceWorkerContainer,
  message: unknown,
): void {
  const event = new MessageEvent('message', { data: message });
  serviceWorkerContainer.dispatchEvent(event);
}

async function createAssistant(options?: {
  availableVersionOnServer?: string | null;
  updateAvailableVersionInterval?: number;
  serviceWorker?: ServiceWorker;
  serviceWorkerRegistrations?: ServiceWorkerRegistration[];
  serviceWorkerContainer?: ServiceWorkerContainer | null;
  verifyCacheValidityInverval?: number;
  correctVersionIsLoaded?: boolean;
  setInstalledVersion?: () => void;
  setAvailableVersion?: () => void;
  setUpdateIsMandatory?: () => void;
  prepareUpdate?: () => void;
  windowLocationReload?: () => void;
  consoleError?: () => void;
}): Promise<ServiceWorkerAssistant> {
  const mutations = {
    setInstalledVersion: options?.setInstalledVersion ?? jest.fn(),
    setAvailableVersion: options?.setAvailableVersion ?? jest.fn(),
    setUpdateIsMandatory: options?.setUpdateIsMandatory ?? jest.fn(),
    prepareUpdate: options?.prepareUpdate ?? jest.fn(),
  };

  const getters = {
    correctVersionIsLoaded: () => options?.correctVersionIsLoaded ?? true,
  };

  const versionInformation = {
    namespaced: true,
    mutations,
    getters,
  };

  const store = new Store<RootStateWithVersionInformation>({
    modules: { versionInformation },
  });

  const composedServiceWorkerContainer = new MockedServiceWorkerContainer({
    serviceWorker: options?.serviceWorker,
    serviceWorkerRegistrations: options?.serviceWorkerRegistrations,
  });

  const mockedServiceWorkerContainer =
    options?.serviceWorkerContainer === null
      ? null
      : options?.serviceWorkerContainer ?? composedServiceWorkerContainer;

  const availableVersionOnServer =
    options?.availableVersionOnServer !== undefined ? options?.availableVersionOnServer : '1.0.0';

  const mockedFetch = respondWithServerVersion.bind(availableVersionOnServer) as Fetch;

  const mockedWindow = {
    location: { reload: options?.windowLocationReload ?? jest.fn() },
    fetch: mockedFetch,
  } as Window;

  const mockedConsole = {
    error: options?.consoleError ?? jest.fn(),
  } as Console;

  const assistant = new ServiceWorkerAssistant(
    store,
    options?.updateAvailableVersionInterval,
    options?.verifyCacheValidityInverval,
    {
      serviceWorkerContainer: mockedServiceWorkerContainer,
      window: mockedWindow,
      console: mockedConsole,
    },
  );

  await flushPromises();
  return assistant;
}

describe('ServiceWorkerAssistant', () => {
  let intervalIds: Array<number>;

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(); // Silence jest-fail-on-console

    const originalSetInterval = global.setInterval;

    jest.spyOn(global, 'setInterval').mockImplementation((handler, timeout) => {
      const id = originalSetInterval(handler, timeout);
      intervalIds.push(id);
      return id;
    });
  });

  beforeEach(() => {
    intervalIds = [];
  });

  afterEach(() => {
    intervalIds.forEach((id) => clearInterval(id));
  });

  describe('update available version in the store module', () => {
    test('not if service workers are not supported', async () => {
      const setAvailableVersion = jest.fn();
      await createAssistant({ serviceWorkerContainer: null, setAvailableVersion });

      expect(setAvailableVersion).not.toHaveBeenCalled();
    });

    test('once upon creation', async () => {
      const setAvailableVersion = jest.fn();
      await createAssistant({ setAvailableVersion });

      expect(setAvailableVersion).toHaveBeenCalledTimes(1);
      expect(setAvailableVersion).toHaveBeenCalledWith({}, '1.0.0');
    });

    test('once per set interval', async () => {
      const setAvailableVersion = jest.fn();
      await createAssistant({ updateAvailableVersionInterval: 300, setAvailableVersion });

      await sleep(800); // Add a padding to let all triggered interval handler finish

      expect(setAvailableVersion).toHaveBeenCalledTimes(3); // Remind the inial update.
    });

    test('not if version is invalid', async () => {
      const consoleError = jest.fn();
      const setAvailableVersion = jest.fn();
      await createAssistant({
        availableVersionOnServer: 'version 2',
        consoleError,
        setAvailableVersion,
      });

      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenNthCalledWith(1, 'Failed to update available version');
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        new Error('Malformed available version: version 2'),
      );
      expect(setAvailableVersion).not.toHaveBeenCalled();
    });

    test('not if fetch response parsing fails', async () => {
      const consoleError = jest.fn();
      const setAvailableVersion = jest.fn();
      await createAssistant({
        availableVersionOnServer: null,
        consoleError,
        setAvailableVersion,
      });

      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenNthCalledWith(1, 'Failed to update available version');
      expect(consoleError).toHaveBeenNthCalledWith(2, 'Failed to parse json');
      expect(setAvailableVersion).not.toHaveBeenCalled();
    });
  });

  describe('triggers cache verification', () => {
    test('not if service workers are not supported', async () => {
      const serviceWorker = new MockedServiceWorker();
      await createAssistant({
        serviceWorkerContainer: null,
        verifyCacheValidityInverval: 200,
        serviceWorker,
      });

      await sleep(500); // Add a padding to let all triggered interval handler finish

      expect(serviceWorker.postMessage).not.toHaveBeenCalled();
    });

    test('once per set interval', async () => {
      const serviceWorker = new MockedServiceWorker();
      await createAssistant({ verifyCacheValidityInverval: 200, serviceWorker });

      await sleep(500); // Add a padding to let all triggered interval handler finish

      expect(serviceWorker.postMessage).toHaveBeenCalledTimes(2);
      expect(serviceWorker.postMessage).toHaveBeenCalledWith({ type: 'verify_cache' });
    });
  });

  describe('on messages', () => {
    test('reloads window when receiving reload message', async () => {
      const message = { type: 'reload_window' };
      const windowLocationReload = jest.fn();
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ windowLocationReload, serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      expect(windowLocationReload).toHaveBeenCalledTimes(1);
    });

    test('set installed version when receiving installation successful message', async () => {
      const message = { type: 'installed_version', version: '1.0.0' };
      const setInstalledVersion = jest.fn();
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ setInstalledVersion, serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);
      await flushPromises(); // It must asynchronously fetch the version

      expect(setInstalledVersion).toHaveBeenCalledTimes(1);
      expect(setInstalledVersion).toHaveBeenCalledWith({}, '1.0.0');
    });

    test('set update is mandatory when receiving installation error message', async () => {
      const message = { type: 'installation_error', error: new Error('test error') };
      const consoleError = jest.fn();
      const setUpdateIsMandatory = jest.fn();
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ consoleError, setUpdateIsMandatory, serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenNthCalledWith(
        1,
        'Service worker failed during installation phase.',
      );
      expect(consoleError).toHaveBeenNthCalledWith(2, new Error('test error'));
      expect(setUpdateIsMandatory).toHaveBeenCalledTimes(1);
    });

    test('set update is mandatory when receiving cache is invalid message', async () => {
      const message = { type: 'cache_is_invalid' };
      const setUpdateIsMandatory = jest.fn();
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ setUpdateIsMandatory, serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      expect(setUpdateIsMandatory).toHaveBeenCalledTimes(1);
    });

    test('can ignore messages that are not of interest', async () => {
      const message = { type: 'verify_cache' };
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      // Just expect that no error gets thrown.
    });

    test('ignores message in old format', async () => {
      // This is just one example message to mesaure the effect of doing nothing
      // for a message that would cause an action in the new format.
      const message = 'cache_is_invalid';
      const setUpdateIsMandatory = jest.fn();
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ setUpdateIsMandatory, serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      expect(setUpdateIsMandatory).not.toHaveBeenCalled();
    });

    test('ignores message in unknown format', async () => {
      const message = { super: 'crazy' };
      const serviceWorkerContainer = new MockedServiceWorkerContainer();
      await createAssistant({ serviceWorkerContainer });

      sendMessageFromServiceWorkerToAssistant(serviceWorkerContainer, message);

      // Just expect that no error gets thrown.
    });
  });

  describe('update()', () => {
    test('prepare update in store module', async () => {
      const prepareUpdate = jest.fn();
      const assistant = await createAssistant({ prepareUpdate });

      assistant.update();

      expect(prepareUpdate).toHaveBeenCalledTimes(1);
    });

    test('send update message to service worker', async () => {
      const serviceWorker = new MockedServiceWorker();
      const assistant = await createAssistant({ serviceWorker });

      assistant.update();
      await flushPromises();

      expect(serviceWorker.postMessage).toHaveBeenCalledTimes(1);
      expect(serviceWorker.postMessage).toHaveBeenCalledWith({ type: 'update' });
    });
  });

  describe('verifyIfCorrectVersionGotLoaded()', () => {
    test('unregister all registered service workers when not the correct version is loaded', async () => {
      const serviceWorkerRegistrationOne = new MockedServiceWorkerRegistration();
      const serviceWorkerRegistrationTwo = new MockedServiceWorkerRegistration();
      const assistant = await createAssistant({
        correctVersionIsLoaded: false,
        serviceWorkerRegistrations: [serviceWorkerRegistrationOne, serviceWorkerRegistrationTwo],
      });

      await assistant.verifyIfCorrectVersionGotLoaded();

      expect(serviceWorkerRegistrationOne.unregister).toHaveBeenCalledTimes(1);
      expect(serviceWorkerRegistrationTwo.unregister).toHaveBeenCalledTimes(1);
    });

    test('reloads window when not the correct version is loaded', async () => {
      const windowLocationReload = jest.fn();
      const assistant = await createAssistant({
        windowLocationReload,
        correctVersionIsLoaded: false,
        serviceWorkerRegistrations: [new MockedServiceWorkerRegistration()],
      });

      await assistant.verifyIfCorrectVersionGotLoaded();

      expect(windowLocationReload).toHaveBeenCalledTimes(1);
    });
  });
});
