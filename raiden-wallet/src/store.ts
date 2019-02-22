import Vue from 'vue';
import Vuex, { StoreOptions } from 'vuex';
import { RootState } from '@/types';

Vue.use(Vuex);

let store: StoreOptions<RootState> = {
  state: {
    loading: true,
    defaultAccount: '',
    accountBalance: '0.0',
    providerDetected: true,
    userDenied: false
  },
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
    }
  },
  actions: {}
};

export default new Vuex.Store(store);
