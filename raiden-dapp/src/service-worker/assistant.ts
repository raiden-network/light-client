/* istanbul ignore file */
import { validate as validateVersion } from 'compare-versions';
import type { Store } from 'vuex';

import type { RootStateWithVersionInformation } from '@/store/version-information';

import {
  ServiceWorkerAssistantMessageIdentifier,
  ServiceWorkerMessageIdentifier,
} from './messages';

const VERSION_FILE_PATH = (process.env.BASE_URL ?? '/') + 'version.json';

export default class ServiceWorkerAssistant {
  private store: Store<RootStateWithVersionInformation>;
  private serviceWorkerContainer: ServiceWorkerContainer;
  private window: Window;
  private console: Console;

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

    if (this.serviceWorkerContainer) {
      this.serviceWorkerContainer.addEventListener('message', this.onMessage.bind(this));
      this.updateAvailableVersion();

      setInterval(this.updateAvailableVersion.bind(this), updateAvailableVersionInterval);
      setInterval(this.verifyCacheValidity.bind(this), verifyCacheValidityInverval);
    }
  }

  public async update(): Promise<void> {
    this.prepareUpdate();
    await this.postMessage(ServiceWorkerAssistantMessageIdentifier.UPDATE);
  }

  public async verifyIfCorrectVersionGotLoaded(): Promise<void> {
    if (!this.correctVersionIsLoaded && (await this.isAnyServiceWorkerRegistered())) {
      this.console.error('Active version is not installed version.');
      await this.unregisterAllServiceWorker();
      this.reloadWindow();
    }
  }

  private onMessage(event: MessageEvent): void {
    if (!(event.data && event.data.messageIdentifier)) return;

    const { messageIdentifier, ...payload } = event.data;

    switch (messageIdentifier) {
      case ServiceWorkerMessageIdentifier.INSTALLED_VERSION:
        this.setInstalledVersion(payload.version);
        break;

      case ServiceWorkerMessageIdentifier.INSTALLATION_ERROR:
        this.reportInstallationError(payload.error);
        break;

      case ServiceWorkerMessageIdentifier.CACHE_IS_INVALID:
        this.setUpdateIsMandatory();
        break;

      case ServiceWorkerMessageIdentifier.RELOAD_WINDOW:
        this.reloadWindow();
        break;

      default:
        break;
    }
  }

  private reportInstallationError(error: Error): void {
    this.console.error('Service worker failed during installation phase.');
    this.console.error(error);
    this.setUpdateIsMandatory();
  }

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
    this.postMessage(ServiceWorkerAssistantMessageIdentifier.VERIFY_CACHE);
  }

  async isAnyServiceWorkerRegistered(): Promise<boolean> {
    const allServiceWokers = (await this.serviceWorkerContainer?.getRegistrations()) ?? [];
    return allServiceWokers.length > 0;
  }

  private async postMessage(
    messageIdentifier: ServiceWorkerAssistantMessageIdentifier,
  ): Promise<void> {
    if (this.serviceWorkerContainer) {
      await this.serviceWorkerContainer.ready;
      const message = { messageIdentifier };
      this.serviceWorkerContainer.controller?.postMessage(message);
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

  private setInstalledVersion(version: string): void {
    if (validateVersion(version)) {
      this.store.commit('versionInformation/setInstalledVersion', version);
    } else {
      throw new Error(`Malformed installation version: ${version}`);
    }
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
