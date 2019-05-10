import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState, Tokens } from '@/types';
import { RaidenChannel, RaidenChannels } from 'raiden';
import {
  AccTokenModel,
  emptyTokenModel,
  PlaceHolderNetwork,
  Token,
  TokenModel
} from '@/model/types';
import map from 'lodash/map';
import flatMap from 'lodash/flatMap';
import clone from 'lodash/clone';
import reduce from 'lodash/reduce';
import { Network } from 'ethers/utils';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  defaultAccount: '',
  accountBalance: '0.0',
  providerDetected: true,
  userDenied: false,
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
    deniedAccess(state: RootState) {
      state.userDenied = true;
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
      state.tokens = Object.assign({}, tokens);
    },
    network(state: RootState, network: Network) {
      state.network = network;
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
      return reduce(
        state.tokens,
        (result: Token[], value: Token, key: string) => {
          const model: Token = {
            address: key,
            balance: value.balance,
            decimals: value.decimals,
            units: value.units,
            symbol: value.symbol,
            name: value.name
          };
          result.push(model);
          return result;
        },
        []
      );
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
    }
  }
};

export default new Vuex.Store(store);
