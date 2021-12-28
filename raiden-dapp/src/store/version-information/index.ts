import type { Module, Plugin } from 'vuex';
import { VuexPersistence } from 'vuex-persist';

import { getters } from './getters';
import { mutations } from './mutations';
import state from './state';
import type { RootStateWithVersionInformation, VersionInformationState } from './types';

export const versionInformation: Module<VersionInformationState, RootStateWithVersionInformation> =
  {
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
export function createVersionInformationPeristencePlugin(
  storage: Storage = window.localStorage,
): Plugin<RootStateWithVersionInformation> {
  const vuexPersistence = new VuexPersistence<RootStateWithVersionInformation>({
    key: 'raiden_dapp_versionInformation',
    storage: storage,
    reducer: (state) => ({
      versionInformation: {
        installedVersion: state.versionInformation.installedVersion,
      },
    }),
    filter: (mutation) => mutation.type === 'versionInformation/setInstalledVersion',
  });

  return vuexPersistence.plugin;
}

export * from './types';
