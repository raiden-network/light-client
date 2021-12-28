/* istanbul ignore file */
import { validate as validateVersion } from 'compare-versions';
import type { Store } from 'vuex';

import type { CombinedStoreState } from '@/store/index';

import {
  ServiceWorkerAssistantMessageIdentifier,
  ServiceWorkerMessageIdentifier,
} from './messages';

const VERSION_FILE_PATH = (process.env.BASE_URL ?? '/') + 'version.json';

export default class ServiceWorkerAssistant {
  constructor(
    private store: Store<CombinedStoreState>,
    updateAvailableVersionInterval = 1000 * 60 * 60,
    verifyCacheValidityInverval = 1000 * 10,
  ) {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', this.onMessage);
      this.updateAvailableVersion();
      setInterval(this.updateAvailableVersion, updateAvailableVersionInterval);
      setInterval(this.verifyCacheValidity, verifyCacheValidityInverval);
    }
  }

  public update = (): void => {
    this.postMessage(ServiceWorkerAssistantMessageIdentifier.UPDATE);
  };

  private onMessage = (event: MessageEvent): void => {
    if (!(event.data && event.data.messageIdentifier)) return;

    const { messageIdentifier, ...payload } = event.data;

    switch (messageIdentifier) {
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
  };

  private reportInstallationError = (error: Error): void => {
    console.error('Service worker failed during installation phase.'); // eslint-disable-line
    console.error(error); // eslint-disable-line
    this.setUpdateIsMandatory();
  };

  private updateAvailableVersion = async (): Promise<void> => {
    try {
      const response = await fetch(VERSION_FILE_PATH);
      const data = await response.json();
      const version = data.version.version;

      if (validateVersion(version)) {
        this.setAvailableVersion(version);
      } else {
        throw new Error(`Maleformed version string: ${version}`);
      }
    } catch (error) {
      console.error(`Failed to get (a valid) version: ${(error as Error).message}`); // eslint-disable-line no-console
    }
  };

  private verifyCacheValidity = (): void => {
    this.postMessage(ServiceWorkerAssistantMessageIdentifier.VERIFY_CACHE);
  };

  private postMessage(messageIdentifier: ServiceWorkerAssistantMessageIdentifier) {
    const message = { messageIdentifier };
    navigator.serviceWorker.controller?.postMessage(message);
  }

  private reloadWindow = (): void => {
    window.location.reload();
  };

  private setAvailableVersion = (version: string): void => {
    this.store.commit('versionInformation/setAvailableVersion', version);
  };

  private setUpdateIsMandatory = (): void => {
    this.store.commit('versionInformation/setUpdateIsMandatory');
  };
}
