import RaidenService from '@/services/raiden-service';
import { RaidenChannels, RaidenTransfer, RaidenConfig } from 'raiden-ts';
import { DeniedReason, Token, Presences } from '@/model/types';
import { Network } from 'ethers/utils';

export type Tokens = { [token: string]: Token };
export type Transfers = { [key: string]: RaidenTransfer };
export type ChannelAction = 'close' | 'deposit' | 'withdraw' | 'settle';
export type Settings = { [setting: string]: boolean | number | string };

export interface RootState {
  loading: boolean;
  blockNumber: number;
  defaultAccount: string;
  accountBalance: string;
  raidenAccountBalance: string;
  providerDetected: boolean;
  accessDenied: DeniedReason;
  channels: RaidenChannels;
  tokens: Tokens;
  tokenAddresses: string[];
  network: Network;
  presences: Presences;
  transfers: Transfers;
  stateBackup: string;
  settings: Settings;
  config: Partial<RaidenConfig>;
  userDepositTokenAddress: string;
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
