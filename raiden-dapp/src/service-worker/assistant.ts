/* istanbul ignore file */
import { Store } from 'vuex';
import compareVersions from 'compare-versions';
import { ServiceWorkerMessages, ServiceWorkerAssistantMessages } from './messages';
import { CombinedStoreState } from '@/store/index';

const VERSION_FILE_PATH = (process.env.BASE_URL ?? '/') + 'version.json';

export default class ServiceWorkerAssistant {
  constructor(private store: Store<CombinedStoreState>) {
    navigator.serviceWorker.onmessage = this.onMessage;
    this.updateAvailableVersion();
    setInterval(this.updateAvailableVersion, 1000 * 60 * 60);
    setInterval(this.verifyCacheValidity, 1000 * 10);
  }

  public update = (): void => {
    navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.UPDATE);
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
      console.warn(`Failed to get (a valid) version: ${error.message}`); // eslint-disable-line no-console
    }
  };

  private verifyCacheValidity = (): void => {
    navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.VERIFY_CACHE);
  };

  private reloadWindow = (): void => {
    // Delay reload so that the service worker can unregister safely if necessary.
    setTimeout(() => window.location.reload(), 1000);
  };

  private setUpdateIsMandatory = (): void => {
    this.store.commit('setUpdateIsMandatory');
  };
}
