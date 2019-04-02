import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState } from '@/types';
import { RaidenChannels } from 'raiden';
import * as _ from 'lodash';

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
    connections: function(state): RaidenChannels[] {
      return _.chain(state.channels)
        .flatMap()
        .map(values => {
          return _.chain(values)
            .flatMap()
            .head()
            .value();
        })
        .value();
    }
  }
};

export default new Vuex.Store(store);
