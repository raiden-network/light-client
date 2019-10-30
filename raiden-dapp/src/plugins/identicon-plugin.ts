import _Vue from 'vue';
import { IdenticonCache } from '@/services/identicon-cache';

export function IdenticonPlugin(Vue: typeof _Vue, _options?: any): void {
  Vue.prototype.$identicon = new IdenticonCache();
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $identicon: IdenticonCache;
  }
}
