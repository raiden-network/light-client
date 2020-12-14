import compareVersions from 'compare-versions';
import { Store } from 'vuex';
import { ServiceWorkerMessages, ServiceWorkerAssistantMessages } from './messages';
import { CombinedStoreState } from '@/store/index';

export default class ServiceWorkerAssistant {
  constructor(private store: Store<CombinedStoreState>) {
    navigator.serviceWorker.onmessage = this.onMessage;
    setInterval(this.updateAvailableVersion, 1000 * 60);
    setInterval(this.verifyCacheValidity, 1000 * 10);
  }

  public update = (): void => {
    navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.UPDATE);
  };

  private onMessage = (event: MessageEvent) => {
    if (!event.data) return

    switch (event.data) {
      case ServiceWorkerMessages.RELOAD_WINDOW:
        this.reloadWindow();
        break;

      case ServiceWorkerMessages.CACHE_IS_INVALID:
        this.setUpdateToMandatory();

      default:
        break;
    }
  };

  private updateAvailableVersion = async (): Promise<void> => {
    try {
      const response = await fetch('/version.json');
      const data = await response.json();
      const version = data.version.version;

      if (compareVersions.validate(version)) {
        this.store.commit('setAvailableVersion', version);
      } else {
        throw new Error(`Maleformed version string: ${version}`);
      }
    } catch (error) {
      console.warn(`Failed to get (a valid) version: ${error.message}`);
      return undefined;
    }
  };

  private verifyCacheValidity = (): void => {
    navigator.serviceWorker.controller?.postMessage(ServiceWorkerAssistantMessages.VERIFY_CACHE_VALIDITY);
  }

  private reloadWindow = (): void => {
    // Delay reload so that the service worker can unregister safely if necessary.
    setTimeout(() => window.location.reload(), 1000);
  };

  private setUpdateToMandatory = (): void => {
    this.store.commit('setUpdateIsMandatory');
  }
}
