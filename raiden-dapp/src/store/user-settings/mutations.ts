import type { MutationTree } from 'vuex';

import type { UserSettingsMutations, UserSettingsState } from './types';

export const mutations: MutationTree<UserSettingsState> & UserSettingsMutations = {
  enableRaidenAccount(state) {
    state.useRaidenAccount = true;
  },
  disableRaidenAccount(state) {
    state.useRaidenAccount = false;
  },
  saveEthereumProviderOptions(state, payload) {
    state.ethereumProviderOptions[payload.providerName] = payload.providerOptions;
  },
};
