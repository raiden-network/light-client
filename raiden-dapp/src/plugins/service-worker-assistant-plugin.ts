import path from 'path';
import _Vue from 'vue';
import store from '@/store/index';
import ServiceWorkerAssistant from '@/service-worker/service-worker-assistant';

const SERVICE_WORKER_SCRIPT = path.join(process.env.BASE_URL ?? '/', 'service-worker.js');

export async function ServiceWorkerAssistantPlugin(
  Vue: typeof _Vue,
  _options?: null
): Promise<void> {
  // Always register the assistant to make components work reliable.
  Vue.prototype.$serviceWorkerAssistant = new ServiceWorkerAssistant(store);

  const serviceWorkerAreSupported = 'serviceWorker' in navigator;
  const serviceWorkerShouldBeRegistered = process.env.NODE_ENV === 'production';

  if (serviceWorkerAreSupported && serviceWorkerShouldBeRegistered) {
    window.onload = () => navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $serviceWorkerAssistant: ServiceWorkerAssistant;
  }
}
