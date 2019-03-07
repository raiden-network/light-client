import RaidenService from '@/services/raiden-service';

export interface RootState {
  loading: boolean;
  defaultAccount: string;
  accountBalance: string;
  providerDetected: boolean;
  userDenied: boolean;
}

declare global {
  interface Window {
    web3: any;
    ethereum: any;
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $raiden: RaidenService;
  }
}
