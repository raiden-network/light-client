import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState } from '@/types';
import { RaidenChannel, RaidenChannels } from 'raiden';
import * as _ from 'lodash';
import {
  createEmptyTokenModel,
  AccTokenModel,
  TokenModel
} from '@/model/types';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  defaultAccount: '',
  accountBalance: '0.0',
  providerDetected: true,
  userDenied: false,
  channels: {}
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

      return _.map(_.flatMap(state.channels), tokenChannels =>
        _.reduce(tokenChannels, reducer, createEmptyTokenModel())
      );
    },
    channels: (state: RootState) => (tokenAddress: string) => {
      let channels: RaidenChannel[] = [];
      const tokenChannels = state.channels[tokenAddress];
      if (tokenChannels) {
        channels = _.flatMap(tokenChannels);
      }
      return channels;
    }
  }
};

export default new Vuex.Store(store);
