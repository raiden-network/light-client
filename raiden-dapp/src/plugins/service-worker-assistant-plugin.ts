import path from 'path';
import _Vue from 'vue';
import store from '@/store';
import ServiceWorkerAssistant from '@/service-worker/assistant';

const SERVICE_WORKER_SCRIPT = path.join(process.env.BASE_URL ?? '/', 'service-worker.js');

/**
 * @param Vue - global Vue instance to act on
 * @param _options - eventual configuration for the plugin (ignored)
 */
export async function ServiceWorkerAssistantPlugin(
  Vue: typeof _Vue,
  _options?: null,
): Promise<void> {
  // Always register the assistant to make components work reliable.
  Vue.prototype.$serviceWorkerAssistant = new ServiceWorkerAssistant(store);

  const serviceWorkerIsSupported = 'serviceWorker' in navigator;
  const serviceWorkerShouldBeRegistered = process.env.NODE_ENV === 'production';

  if (serviceWorkerIsSupported && serviceWorkerShouldBeRegistered) {
    window.onload = () => navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $serviceWorkerAssistant: ServiceWorkerAssistant;
  }
}
