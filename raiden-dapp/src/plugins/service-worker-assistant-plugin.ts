import path from 'path';
import Vue from 'vue';

const SERVICE_WORKER_SCRIPT = path.join(process.env.BASE_URL ?? '/', 'service-worker.js');

/**
 * @param _Vue - global Vue instance to act on
 * @param _options - eventual configuration for the plugin (ignored)
 */
export async function ServiceWorkerAssistantPlugin(
  _Vue: typeof Vue,
  _options?: null,
): Promise<void> {
  const serviceWorkerIsSupported = 'serviceWorker' in navigator;
  const serviceWorkerShouldBeRegistered = process.env.NODE_ENV === 'production';

  if (serviceWorkerIsSupported && serviceWorkerShouldBeRegistered) {
    window.onload = () => navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
  }
}
