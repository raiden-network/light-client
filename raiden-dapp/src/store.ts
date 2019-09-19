import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState, Tokens } from '@/types';
import { ChannelState, RaidenChannel, RaidenChannels } from 'raiden-ts';
import {
  AccTokenModel,
  DeniedReason,
  emptyTokenModel,
  PlaceHolderNetwork,
  Token,
  TokenModel
} from '@/model/types';
import map from 'lodash/map';
import flatMap from 'lodash/flatMap';
import clone from 'lodash/clone';
import reduce from 'lodash/reduce';
import orderBy from 'lodash/orderBy';
import isEqual from 'lodash/isEqual';
import { Network } from 'ethers/utils';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  defaultAccount: '',
  accountBalance: '0.0',
  providerDetected: true,
  accessDenied: DeniedReason.UNDEFINED,
  channels: {},
  tokens: {},
  network: PlaceHolderNetwork
};

export function defaultState(): RootState {
  return clone(_defaultState);
}

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
    network(state: RootState, network: Network) {
      state.network = network;
    },
    reset(state: RootState) {
      Object.assign(state, defaultState());
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

      return map(flatMap(state.channels), tokenChannels => {
        const model = reduce(tokenChannels, reducer, emptyTokenModel());
        const tokenInfo = state.tokens[model.address];
        if (tokenInfo) {
          model.name = tokenInfo.name || '';
          model.symbol = tokenInfo.symbol || '';
        }

        return model;
      });
    },
    allTokens: (state: RootState): Token[] => {
      return Object.values(state.tokens);
    },
    channels: (state: RootState) => (tokenAddress: string) => {
      let channels: RaidenChannel[] = [];
      const tokenChannels = state.channels[tokenAddress];
      if (tokenChannels) {
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
    }
  }
};

export default new Vuex.Store(store);
