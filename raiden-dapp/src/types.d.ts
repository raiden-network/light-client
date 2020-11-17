/* eslint-disable @typescript-eslint/no-explicit-any */
import 'vuetify/types/lib.d';
import { providers } from 'ethers';
import RaidenService from '@/services/raiden-service';
import { RaidenChannels, RaidenTransfer, RaidenConfig } from 'raiden-ts';
import { DeniedReason, Token, Presences } from '@/model/types';

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
  network: providers.Network;
  presences: Presences;
  transfers: Transfers;
  stateBackup: string;
  settings: Settings;
  config: Partial<RaidenConfig>;
  disclaimerAccepted: boolean;
  stateBackupReminderDateMs: number;
  persistDisclaimerAcceptance: boolean;
}

declare global {
  interface Window {
    web3: any;
    ethereum: any;
  }

  type ServiceWorkerUpdatedEvent = CustomEvent<ServiceWorkerRegistration>;

  interface WindowEventMap {
    swUpdated: ServiceWorkerUpdatedEvent;
  }
}

declare module 'vue/types/vue' {
  interface Vue {
    $raiden: RaidenService;
  }
}

declare module 'vuetify/lib' {
  export interface VTextField extends Vue {
    valid: boolean;
    validate: () => void;
  }

  export interface VForm extends Vue {
    reset: () => void;
  }
}
