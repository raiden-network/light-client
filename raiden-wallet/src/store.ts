import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState, Tokens } from '@/types';
import { RaidenChannel, RaidenChannels } from 'raiden';
import * as _ from 'lodash';
import {
  emptyTokenModel,
  AccTokenModel,
  TokenModel,
  Token
} from '@/model/types';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  defaultAccount: '',
  accountBalance: '0.0',
  providerDetected: true,
  userDenied: false,
  channels: {},
  tokens: {}
};

export function defaultState(): RootState {
  return _.clone(_defaultState);
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

      return _.map(_.flatMap(state.channels), tokenChannels => {
        const model = _.reduce(tokenChannels, reducer, emptyTokenModel());
        const tokenInfo = state.tokens[model.address];
        if (tokenInfo) {
          model.name = tokenInfo.name || '';
          model.symbol = tokenInfo.symbol || '';
        }

        return model;
      });
    },
    allTokens: (state: RootState): Token[] => {
      return _.reduce(
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
        channels = _.flatMap(tokenChannels);
      }
      return channels;
    },
    token: (state: RootState) => (tokenAddress: string) => {
      if (tokenAddress in state.tokens) {
        return state.tokens[tokenAddress];
      } else {
        return null;
      }
    }
  }
};

export default new Vuex.Store(store);
