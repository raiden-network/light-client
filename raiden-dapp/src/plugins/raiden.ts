import type _Vue from 'vue';

import router from '@/router';
import RaidenService from '@/services/raiden-service';
import store from '@/store/index';

/**
 * @param Vue - global Vue instance to act on
 * @param _options - eventual configuration for the plugin (ignored)
 */
export function RaidenPlugin(Vue: typeof _Vue, _options?: null): void {
  Vue.prototype.$raiden = new RaidenService(store, router);
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $raiden: RaidenService;
  }
}
