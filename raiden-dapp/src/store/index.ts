import Vue from 'vue';
import VuexPersistence from 'vuex-persist';
import Vuex, { StoreOptions } from 'vuex';
import { RootState, Tokens, Transfers, Settings } from '@/types';
import {
  ChannelState,
  RaidenChannel,
  RaidenChannels,
  RaidenTransfer
} from 'raiden-ts';
import {
  AccTokenModel,
  DeniedReason,
  emptyTokenModel,
  PlaceHolderNetwork,
  Token,
  TokenModel,
  Presences
} from '@/model/types';
import map from 'lodash/map';
import flatMap from 'lodash/flatMap';
import filter from 'lodash/filter';
import clone from 'lodash/clone';
import reduce from 'lodash/reduce';
import orderBy from 'lodash/orderBy';
import isEqual from 'lodash/isEqual';
import isEmpty from 'lodash/isEmpty';
import { Network, BigNumber } from 'ethers/utils';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  defaultAccount: '',
  accountBalance: '0.0',
  raidenAccountBalance: '',
  providerDetected: true,
  accessDenied: DeniedReason.UNDEFINED,
  channels: {},
  tokens: {},
  transfers: {},
  presences: {},
  network: PlaceHolderNetwork,
  stateBackup: '',
  settings: {
    isFirstTimeConnect: true,
    useRaidenAccount: true
  }
};

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

const settingsLocalStorage = new VuexPersistence<RootState>({
  storage: window.localStorage,
  reducer: state => ({ settings: state.settings }),
  filter: mutation => mutation.type == 'updateSettings',
  key: 'raiden_dapp_settings'
});

const store: StoreOptions<RootState> = {
  state: defaultState(),
  mutations: {
    noProvider(state: RootState) {
      state.providerDetected = false;
    },
    accessDenied(state: RootState, reason: DeniedReason) {
      state.accessDenied = reason;
    },
    account(state: RootState, account: string) {
      state.defaultAccount = account;
    },
    loadComplete(state: RootState) {
      state.loading = false;
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
        if (address in state.tokens && isEqual(token, state.tokens[address]))
          continue;
        else if (address in state.tokens)
          state.tokens[address] = { ...state.tokens[address], ...token };
        else state.tokens = { ...state.tokens, [address]: token };
    },
    updatePresence(state: RootState, presence: Presences) {
      state.presences = { ...state.presences, ...presence };
    },
    network(state: RootState, network: Network) {
      state.network = network;
    },
    reset(state: RootState) {
      // Preserve settings when resetting state
      const { settings } = state;

      Object.assign(state, { ...defaultState(), settings });
    },
    updateTransfers(state: RootState, transfer: RaidenTransfer) {
      state.transfers = { ...state.transfers, [transfer.key]: transfer };
    },
    backupState(state: RootState, uploadedState: string) {
      state.stateBackup = uploadedState;
    },
    updateSettings(state: RootState, settings: Settings) {
      state.settings = settings;
    }
  },
  actions: {},
  getters: {
    tokens: function(state: RootState): TokenModel[] {
      const reducer = (
        acc: AccTokenModel,
        channel: RaidenChannel
      ): AccTokenModel => {
        acc.address = channel.token;
        (acc[channel.state] as number) += 1;
        return acc;
      };

      return map(
        filter(flatMap(state.channels), channels => !isEmpty(channels)),
        tokenChannels => {
          const model = reduce(tokenChannels, reducer, emptyTokenModel());
          const tokenInfo = state.tokens[model.address];
          if (tokenInfo) {
            model.name = tokenInfo.name || '';
            model.symbol = tokenInfo.symbol || '';
          }

          return model;
        }
      );
    },
    allTokens: (state: RootState): Token[] =>
      Object.values(state.tokens).sort((a: Token, b: Token) => {
        if (hasNonZeroBalance(a, b)) {
          return a.balance! < b.balance! ? 1 : -1;
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
    token: (state: RootState) => (tokenAddress: string) => {
      if (tokenAddress in state.tokens) {
        return state.tokens[tokenAddress];
      } else {
        return null;
      }
    },
    network: (state: RootState) => {
      return state.network.name || `Chain ${state.network.chainId}`;
    },
    channelWithBiggestCapacity: (_, getters) => (tokenAddress: string) => {
      const channels: RaidenChannel[] = getters.channels(tokenAddress);
      const openChannels = channels.filter(
        value => value.state === ChannelState.open
      );
      return orderBy(openChannels, ['capacity'], ['desc'])[0];
    },
    pendingTransfers: ({ transfers }: RootState) =>
      Object.keys(transfers)
        .filter(key => {
          const { completed } = transfers[key];

          // return whether transfer is pending or not
          return !completed;
        })
        .reduce((pendingTransfers: Transfers, key: string) => {
          pendingTransfers[key] = transfers[key];
          return pendingTransfers;
        }, {}),
    transfer: (state: RootState) => (paymentId: BigNumber) => {
      const key = Object.keys(state.transfers).find(
        key => state.transfers[key].paymentId === paymentId
      );

      if (key) {
        return state.transfers[key];
      }

      return undefined;
    },
    isConnected: (state: RootState): boolean => {
      return (
        !state.loading &&
        !!(state.defaultAccount && state.defaultAccount !== '')
      );
    },
    balance: (state: RootState): string => {
      return state.raidenAccountBalance
        ? state.raidenAccountBalance
        : state.accountBalance;
    }
  },
  plugins: [settingsLocalStorage.plugin]
};

export default new Vuex.Store(store);
