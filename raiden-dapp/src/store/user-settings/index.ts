import type { Module, Plugin } from 'vuex';
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

/**
 * @param storage - object implementing the Storage interface to persist the
 *                  state (defaults to `window.localStorage`)
 * @returns plugin for the root store to persist data
 */
export function createUserSettingsPersistencePlugin(
  storage: Storage = window.localStorage,
): Plugin<RootStateWithUserSettings> {
  const vuexPersistence = new VuexPersistence<RootStateWithUserSettings>({
    key: 'raiden_dapp_settings',
    storage: storage,
    modules: ['userSettings'],
  });

  return vuexPersistence.plugin;
}

export * from './types';
