import RaidenService from '@/services/raiden-service';
import { RaidenChannels, RaidenTransfer } from 'raiden-ts';
import { DeniedReason, Token, Presences } from '@/model/types';
import { Network } from 'ethers/utils';

export type Tokens = { [token: string]: Token };
export type Transfers = { [secretHash: string]: RaidenTransfer };
export type ChannelAction = 'close' | 'deposit' | 'settle';

export interface ConnectOptions {
  uploadedState: string;
  subkey?: true;
}

export interface RootState {
  loading: boolean;
  defaultAccount: string;
  accountBalance: string;
  raidenAccountBalance: string;
  providerDetected: boolean;
  accessDenied: DeniedReason;
  channels: RaidenChannels;
  tokens: Tokens;
  network: Network;
  presences: Presences;
  transfers: Transfers;
  stateBackup: string;
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
