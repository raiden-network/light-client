import _Vue from 'vue';
import RaidenService from '@/services/raiden-service';
import store from '@/store';

export function Web3Plugin(Vue: typeof _Vue, options?: any): void {
  Vue.prototype.$raiden = new RaidenService(store);
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $raiden: RaidenService;
  }
}
