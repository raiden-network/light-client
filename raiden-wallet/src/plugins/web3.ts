import _Vue from 'vue';
import Web3Service from '@/services/web3-service';

export function Web3Plugin(Vue: typeof _Vue, options?: any): void {
  Vue.prototype.$web3 = new Web3Service();
}

declare module 'vue/types/vue' {
  // 3. Declare augmentation for Vue
  interface Vue {
    $web3: Web3Service;
  }
}
