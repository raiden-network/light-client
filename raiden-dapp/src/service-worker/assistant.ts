/* istanbul ignore file */
import compareVersions from 'compare-versions';
import type { Store } from 'vuex';

import type { CombinedStoreState } from '@/store/index';

import { ServiceWorkerAssistantMessages, ServiceWorkerMessages } from './messages';

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
    if (navigator.serviceWorker) {
      navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.UPDATE);
    }
  };

  private onMessage = (event: MessageEvent): void => {
    if (!event.data) return;

    switch (event.data) {
      case ServiceWorkerMessages.INSTALLATION_ERROR:
      case ServiceWorkerMessages.CACHE_IS_INVALID:
        this.setUpdateIsMandatory();
        break;

      case ServiceWorkerMessages.RELOAD_WINDOW:
        this.reloadWindow();
        break;

      default:
        break;
    }
  };

  private updateAvailableVersion = async (): Promise<void> => {
    try {
      const response = await fetch(VERSION_FILE_PATH);
      const data = await response.json();
      const version = data.version.version;

      if (compareVersions.validate(version)) {
        this.store.commit('setAvailableVersion', version);
      } else {
        throw new Error(`Maleformed version string: ${version}`);
      }
    } catch (error) {
      console.warn(`Failed to get (a valid) version: ${(error as Error).message}`); // eslint-disable-line no-console
    }
  };

  private verifyCacheValidity = (): void => {
    navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.VERIFY_CACHE);
  };

  private reloadWindow = (): void => {
    window.location.reload();
  };

  private setUpdateIsMandatory = (): void => {
    this.store.commit('setUpdateIsMandatory');
  };
}
