import type { Module } from 'vuex';
import { VuexPersistence } from 'vuex-persist';

import type { RootState } from '@/types';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';
import type { UserSettingsState } from './types';

export const userSettings: Module<UserSettingsState, RootState> = {
  namespaced: true,
  state,
  getters,
  mutations,
};

export const userSettingsLocalStorage = new VuexPersistence<RootState>({
  key: 'raiden_dapp_settings',
  modules: ['userSettings'],
});

export * from './types';
