import _Vue from 'vue';
import RaidenService from '@/services/raiden-service';
import store from '@/store/index';
import router from '@/router';

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
