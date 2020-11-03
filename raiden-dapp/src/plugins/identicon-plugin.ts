import _Vue from 'vue';
import { IdenticonCache } from '@/services/identicon-cache';

/**
 * @param Vue - global Vue instance to act on
 * @param _options - eventual configuration for the plugin (ignored)
 */
export function IdenticonPlugin(Vue: typeof _Vue, _options?: null): void {
  Vue.prototype.$identicon = new IdenticonCache();
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $identicon: IdenticonCache;
  }
}
