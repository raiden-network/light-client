/* eslint-disable @typescript-eslint/no-explicit-any */
import 'vuetify/types/lib.d';

import type { BigNumber, providers } from 'ethers';

import type { RaidenChannels, RaidenConfig, RaidenTransfer } from 'raiden-ts';

import type { Presences, Token } from '@/model/types';
import type RaidenService from '@/services/raiden-service';

export type Tokens = { [token: string]: Token };
export type Transfers = { [key: string]: RaidenTransfer };
export type ChannelAction = 'close' | 'deposit' | 'withdraw' | 'settle';

export interface VersionInfo {
  activeVersion: string;
  availableVersion: string | undefined;
  updateIsMandatory: boolean;
}

export interface RootState {
  isConnected: boolean;
  blockNumber: number;
  defaultAccount: string;
  accountBalance: string;
  raidenAccountBalance: string;
  channels: RaidenChannels;
  tokens: Tokens;
  network: providers.Network;
  presences: Presences;
  transfers: Transfers;
  stateBackup: string;
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

  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: Array<string>;
    readonly userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;

    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
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
