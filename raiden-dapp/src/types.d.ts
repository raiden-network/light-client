import RaidenService from '@/services/raiden-service';
import { RaidenChannels } from 'raiden-ts';
import { DeniedReason, Token } from '@/model/types';
import { Network } from 'ethers/utils';

export type Tokens = { [token: string]: Token };

export interface RootState {
  loading: boolean;
  defaultAccount: string;
  accountBalance: string;
  providerDetected: boolean;
  accessDenied: DeniedReason;
  channels: RaidenChannels;
  tokens: Tokens;
  network: Network;
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
