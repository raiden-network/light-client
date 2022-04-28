/* istanbul ignore file */
import { validate as validateVersion } from 'compare-versions';
import type { Store } from 'vuex';

import type { RootStateWithVersionInformation } from '@/store/version-information';

import type { ServiceWorkerMessageHandler, ServiceWorkerMessagePayload } from './messages';
import {
  ServiceWorkerMessageEvent,
  ServiceWorkerMessageSimple,
  ServiceWorkerMessageType,
} from './messages';

const VERSION_FILE_PATH = (process.env.BASE_URL ?? '/') + 'version.json';

export default class ServiceWorkerAssistant {
  private store: Store<RootStateWithVersionInformation>;
  private serviceWorkerContainer: ServiceWorkerContainer;
  private window: Window;
  private console: Console;
  private messageHandlers: Partial<Record<ServiceWorkerMessageType, ServiceWorkerMessageHandler>>;

  constructor(
    store: Store<RootStateWithVersionInformation>,
    updateAvailableVersionInterval = 1000 * 60 * 60,
    verifyCacheValidityInverval = 1000 * 10,
    environment?: {
      // for testing purpose
      serviceWorkerContainer?: ServiceWorkerContainer | null;
      window?: Window;
      console?: Console;
    },
  ) {
    this.store = store;
    this.serviceWorkerContainer =
      environment?.serviceWorkerContainer ?? global.navigator.serviceWorker;
    this.window = environment?.window ?? global.window;
    this.console = environment?.console ?? global.console;
    this.messageHandlers = {
      [ServiceWorkerMessageType.INSTALLED_VERSION]: this.handleInstalledVersionMessage,
      [ServiceWorkerMessageType.INSTALLATION_ERROR]: this.handleInstallationErrorMessage,
      [ServiceWorkerMessageType.CACHE_IS_INVALID]: this.handleCacheIsInvalidMessage,
      [ServiceWorkerMessageType.RELOAD_WINDOW]: this.handleReloadWindowMessage,
    };

    if (this.serviceWorkerContainer && process.env.VUE_APP_SERVICE_WORKER_DISABLED !== 'true') {
      this.serviceWorkerContainer.addEventListener('message', this.onMessage.bind(this));
      this.updateAvailableVersion();

      setInterval(this.updateAvailableVersion.bind(this), updateAvailableVersionInterval);
      setInterval(this.verifyCacheValidity.bind(this), verifyCacheValidityInverval);
    }
  }

  public async update(): Promise<void> {
    this.prepareUpdate();
    await this.postMessage(ServiceWorkerMessageType.UPDATE);
  }

  public async verifyIfCorrectVersionGotLoaded(): Promise<void> {
    if (!this.correctVersionIsLoaded && (await this.isAnyServiceWorkerRegistered())) {
      this.console.error('Active version is not installed version.');
      await this.unregisterAllServiceWorker();
      this.reloadWindow();
    }
  }

  private onMessage(event: MessageEvent): void {
    const message = new ServiceWorkerMessageEvent(event);

    // Skip old message formats. A client (us here) can never be connected to
    // a worker of an older version than the client itself. Thereby the worker
    // will send the message also in the new and more enriched format again.
    // This is different for the worker which must expect to receive message
    // from an client older then himself.
    if (message.isInOldFormat) return;

    this.messageHandlers[message.type]?.call(this, message.payload);
  }

  private handleInstalledVersionMessage: ServiceWorkerMessageHandler = (payload) => {
    const { version } = payload;

    if (validateVersion(version as string)) {
      this.store.commit('versionInformation/setInstalledVersion', version);
    } else {
      throw new Error(`Malformed installation version: ${version}`);
    }
  };

  private handleInstallationErrorMessage: ServiceWorkerMessageHandler = (payload) => {
    this.console.error('Service worker failed during installation phase.');
    this.console.error(payload.error);
    this.setUpdateIsMandatory();
  };

  private handleCacheIsInvalidMessage: ServiceWorkerMessageHandler = () => {
    this.setUpdateIsMandatory();
  };

  private handleReloadWindowMessage: ServiceWorkerMessageHandler = () => {
    this.reloadWindow();
  };

  private async updateAvailableVersion(): Promise<void> {
    try {
      const response = await this.window.fetch(VERSION_FILE_PATH);
      const data = await response.json();
      const version = data.version.version;
      this.setAvailableVersion(version);
    } catch (error) {
      this.console.error('Failed to update available version');
      this.console.error(error);
    }
  }

  private verifyCacheValidity(): void {
    this.postMessage(ServiceWorkerMessageType.VERIFY_CACHE);
  }

  async isAnyServiceWorkerRegistered(): Promise<boolean> {
    const allServiceWokers = (await this.serviceWorkerContainer?.getRegistrations()) ?? [];
    return allServiceWokers.length > 0;
  }

  private async postMessage(
    type: ServiceWorkerMessageType,
    payload: ServiceWorkerMessagePayload = {},
  ): Promise<void> {
    if (this.serviceWorkerContainer) {
      await this.serviceWorkerContainer.ready;
      const message = new ServiceWorkerMessageSimple(type, payload);
      this.serviceWorkerContainer.controller?.postMessage(message.encode());
    }
  }

  private async unregisterAllServiceWorker(): Promise<void> {
    const allServiceWorkers = (await this.serviceWorkerContainer?.getRegistrations()) ?? [];

    await Promise.all(allServiceWorkers.map(async (serviceWorker) => serviceWorker.unregister()));
  }

  private reloadWindow(): void {
    this.window.location.reload();
  }

  private get correctVersionIsLoaded(): boolean {
    return this.store.getters['versionInformation/correctVersionIsLoaded'];
  }

  private setAvailableVersion(version: string): void {
    if (validateVersion(version)) {
      this.store.commit('versionInformation/setAvailableVersion', version);
    } else {
      throw new Error(`Malformed available version: ${version}`);
    }
  }

  private setUpdateIsMandatory(): void {
    this.store.commit('versionInformation/setUpdateIsMandatory');
  }

  private prepareUpdate(): void {
    this.store.commit('versionInformation/prepareUpdate');
  }
}
