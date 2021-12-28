import type { Module } from 'vuex';
import { VuexPersistence } from 'vuex-persist';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';
import type { RootStateWithUserSettings, UserSettingsState } from './types';

export const userSettings: Module<UserSettingsState, RootStateWithUserSettings> = {
  namespaced: true,
  state,
  getters,
  mutations,
};

export const userSettingsLocalStorage = new VuexPersistence<RootStateWithUserSettings>({
  key: 'raiden_dapp_settings',
  modules: ['userSettings'],
});

export * from './types';
