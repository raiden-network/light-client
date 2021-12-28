import type { GetterTree } from 'vuex';

import type { RootStateWithUserSettings, UserSettingsGetters, UserSettingsState } from './types';

export const getters: GetterTree<UserSettingsState, RootStateWithUserSettings> &
  UserSettingsGetters = {
  // This getter is relevant to have a standardized default value that works for
  // all component which interact with such provider options.
  getEthereumProviderOptions: (state) => (providerName) => {
    return state.ethereumProviderOptions[providerName] ?? {};
  },
};
