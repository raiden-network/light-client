import type { BigNumber, providers } from 'ethers';
import clone from 'lodash/clone';
import filter from 'lodash/filter';
import flatMap from 'lodash/flatMap';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import map from 'lodash/map';
import reduce from 'lodash/reduce';
import Vue from 'vue';
import type { StoreOptions } from 'vuex';
import Vuex from 'vuex';
import VuexPersistence from 'vuex-persist';

import type { RaidenChannel, RaidenChannels, RaidenConfig, RaidenTransfer } from 'raiden-ts';
import { ChannelState, getNetworkName } from 'raiden-ts';

import type { AccTokenModel, Presences, Token, TokenModel } from '@/model/types';
import { emptyTokenModel, PlaceHolderNetwork } from '@/model/types';
import { notifications } from '@/store/notifications';
import type { RootStateWithNotifications } from '@/store/notifications/types';
import type { RootStateWithUserDepositContract } from '@/store/user-deposit-contract';
import { userDepositContract } from '@/store/user-deposit-contract';
import type { RootStateWithUserSettings } from '@/store/user-settings';
import { createUserSettingsPersistencePlugin, userSettings } from '@/store/user-settings';
import type { RootStateWithVersionInformation } from '@/store/version-information';
import {
  createVersionInformationPeristencePlugin,
  versionInformation,
} from '@/store/version-information';
import type { RootState, Tokens, Transfers } from '@/types';

import { DISCLAIMER_STORAGE_KEY } from './constants';

Vue.use(Vuex);

const _defaultState: RootState = {
  isConnected: false,
  blockNumber: 0,
  defaultAccount: '',
  accountBalance: '0.0',
  raidenAccountBalance: '',
  channels: {},
  tokens: {},
  transfers: {},
  presences: {},
  network: PlaceHolderNetwork,
  stateBackup: '',
  config: {},
  disclaimerAccepted: false,
  stateBackupReminderDateMs: 0,
  persistDisclaimerAcceptance: false,
};

/**
 * @returns clone of the default root state object
 */
export function defaultState(): RootState {
  return clone(_defaultState);
}

/*
 * Helper function that checks whether two Tokens a and b
 * have a balance and if one of them isn't zero.
 */
const hasNonZeroBalance = (a: Token, b: Token) =>
  a.balance &&
  b.balance &&
  (!(a.balance as BigNumber).isZero() || !(b.balance as BigNumber).isZero());

const disclaimerLocalStorage = new VuexPersistence<RootState>({
  reducer: (state) => ({
    disclaimerAccepted: state.persistDisclaimerAcceptance ? state.disclaimerAccepted : false,
  }),
  filter: (mutation) => mutation.type === 'acceptDisclaimer',
  key: DISCLAIMER_STORAGE_KEY,
});

const backupReminderLocalStorage = new VuexPersistence<RootState>({
  reducer: (state) => ({ stateBackupReminderDateMs: state.stateBackupReminderDateMs }),
  filter: (mutation) => mutation.type === 'updateStateBackupReminderDate',
  key: 'backupReminder',
});

export type CombinedStoreState = RootState &
  RootStateWithNotifications &
  RootStateWithUserDepositContract &
  RootStateWithUserSettings &
  RootStateWithVersionInformation;

const store: StoreOptions<CombinedStoreState> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: defaultState() as any, // 'notifications' member filled in by module
  mutations: {
    setConnected(state: RootState) {
      state.isConnected = true;
    },
    setDisconnected(state: RootState) {
      state.isConnected = false;
    },
    account(state: RootState, account: string) {
      state.defaultAccount = account;
    },
    updateBlock(state: RootState, block: number) {
      state.blockNumber = block;
    },
    balance(state: RootState, balance: string) {
      state.accountBalance = balance;
    },
    raidenAccountBalance(state: RootState, balance: string) {
      state.raidenAccountBalance = balance;
    },
    updateChannels(state: RootState, channels: RaidenChannels) {
      state.channels = channels;
    },
    updateTokens(state: RootState, tokens: Tokens) {
      for (const [address, token] of Object.entries(tokens))
        if (address in state.tokens && isEqual(token, state.tokens[address])) continue;
        else if (address in state.tokens)
          state.tokens[address] = { ...state.tokens[address], ...token };
        else state.tokens = { ...state.tokens, [address]: token };
    },
    updatePresence(state: RootState, presence: Presences) {
      state.presences = { ...state.presences, ...presence };
    },
    network(state: RootState, network: providers.Network) {
      state.network = network;
    },
    reset(state: RootState) {
      // Preserve settings and backup when resetting state
      const { disclaimerAccepted, stateBackup, stateBackupReminderDateMs } = state;

      Object.assign(state, {
        ...defaultState(),
        disclaimerAccepted,
        stateBackup,
        stateBackupReminderDateMs,
      });
    },
    updateTransfers(state: RootState, transfer: RaidenTransfer) {
      state.transfers = { ...state.transfers, [transfer.key]: transfer };
    },
    backupState(state: RootState, uploadedState: string) {
      state.stateBackup = uploadedState;
    },
    clearBackupState(state: RootState) {
      state.stateBackup = '';
    },
    updateConfig(state: RootState, config: Partial<RaidenConfig>) {
      state.config = config;
    },
    acceptDisclaimer(state: RootState, persistDecision: boolean) {
      state.disclaimerAccepted = true;
      state.persistDisclaimerAcceptance = persistDecision;
    },
    updateStateBackupReminderDate(state: RootState, newReminderDate: number) {
      state.stateBackupReminderDateMs = newReminderDate;
    },
  },
  actions: {},
  getters: {
    tokensWithChannels: function (state: RootState): Tokens {
      const tokensWithChannels: Tokens = {};

      for (const [address, token] of Object.entries(state.tokens)) {
        if (!!state.channels[address]) tokensWithChannels[address] = token;
      }

      return tokensWithChannels;
    },
    tokens: function (state: RootState): TokenModel[] {
      const reducer = (acc: AccTokenModel, channel: RaidenChannel): AccTokenModel => {
        acc.address = channel.token;
        (acc[channel.state] as number) += 1;
        return acc;
      };

      return map(
        filter(flatMap(state.channels), (channels) => !isEmpty(channels)),
        (tokenChannels) => {
          const model = reduce(tokenChannels, reducer, emptyTokenModel());
          const tokenInfo = state.tokens[model.address];
          if (tokenInfo) {
            model.name = tokenInfo.name || '';
            model.symbol = tokenInfo.symbol || '';
          }

          return model;
        },
      );
    },
    allTokens: (state: RootState): Token[] =>
      Object.values(state.tokens).sort((a: Token, b: Token) => {
        if (hasNonZeroBalance(a, b)) {
          return (b.balance! as BigNumber).gt(a.balance! as BigNumber) ? 1 : -1;
        }
        return a.symbol && b.symbol ? a.symbol.localeCompare(b.symbol) : 0;
      }),
    channels: (state: RootState) => (tokenAddress: string) => {
      let channels: RaidenChannel[] = [];
      const tokenChannels = state.channels[tokenAddress];
      if (tokenChannels && !isEmpty(tokenChannels)) {
        channels = flatMap(tokenChannels);
      }
      return channels;
    },
    openChannels: (state: RootState) => {
      return Object.keys(state.channels).length > 0;
    },
    token: (state: RootState) => (tokenAddress: string) => {
      if (tokenAddress in state.tokens) {
        return state.tokens[tokenAddress];
      } else {
        return null;
      }
    },
    network: (state: RootState) => {
      return getNetworkName(state.network);
    },
    mainnet: (state: RootState) => {
      return state.network.chainId === 1;
    },
    channelWithBiggestCapacity: (_, getters) => (tokenAddress: string) => {
      const channels: RaidenChannel[] = getters.channels(tokenAddress);
      const openChannels = channels.filter((value) => value.state === ChannelState.open);

      const ordered = openChannels.sort((a, b) => {
        const diff = a.capacity.sub(b.capacity);
        if (diff.lt(0)) return 1;
        else if (diff.gt(0)) return -1;
        else return 0;
      });

      return ordered[0];
    },
    pendingTransfers: ({ transfers }: RootState) =>
      Object.keys(transfers)
        .filter((key) => {
          const { completed } = transfers[key];

          // return whether transfer is pending or not
          return !completed;
        })
        .reduce((pendingTransfers: Transfers, key: string) => {
          pendingTransfers[key] = transfers[key];
          return pendingTransfers;
        }, {}),
    transfer: (state: RootState) => (paymentId: BigNumber) => {
      return Object.values(state.transfers).find((transfer) => transfer.paymentId.eq(paymentId));
    },
  },
  plugins: [
    createUserSettingsPersistencePlugin(),
    disclaimerLocalStorage.plugin,
    backupReminderLocalStorage.plugin,
    createVersionInformationPeristencePlugin(),
  ],
  modules: {
    notifications,
    userDepositContract,
    userSettings,
    versionInformation,
  },
};

export default new Vuex.Store(store);
