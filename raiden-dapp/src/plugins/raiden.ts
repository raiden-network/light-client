import _Vue from 'vue';
import RaidenService from '@/services/raiden-service';
import store from '@/store';

export function RaidenPlugin(Vue: typeof _Vue, _options?: any): void {
  Vue.prototype.$raiden = new RaidenService(store);
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $raiden: RaidenService;
  }
}
