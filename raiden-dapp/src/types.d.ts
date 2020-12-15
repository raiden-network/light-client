/* eslint-disable @typescript-eslint/no-explicit-any */
import 'vuetify/types/lib.d';
import { BigNumber, providers } from 'ethers';
import RaidenService from '@/services/raiden-service';
import { DeniedReason, Token, Presences } from '@/model/types';
import { RaidenChannels, RaidenTransfer, RaidenConfig } from 'raiden-ts';

export type Tokens = { [token: string]: Token };
export type Transfers = { [key: string]: RaidenTransfer };
export type ChannelAction = 'close' | 'deposit' | 'withdraw' | 'settle';
export type Settings = { [setting: string]: boolean | number | string };

export interface VersionInfo {
  activeVersion: string;
  availableVersion: string | undefined;
  updateIsMandatory: boolean;
}

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
  network: providers.Network;
  presences: Presences;
  transfers: Transfers;
  stateBackup: string;
  settings: Settings;
  config: Partial<RaidenConfig>;
  disclaimerAccepted: boolean;
  stateBackupReminderDateMs: number;
  persistDisclaimerAcceptance: boolean;
  versionInfo: VersionInfo;
}

export interface SuggestedPartner {
  address: string;
  capacity: BigNumber;
  centrality: string | number;
  score: string | number;
  uptime: string | number;
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

declare module 'vuetify/lib' {
  export interface VTextField extends Vue {
    valid: boolean;
    validate: () => void;
  }

  export interface VForm extends Vue {
    reset: () => void;
  }
}
