import type { GetterTree } from 'vuex';

import type { RootState } from '@/types';

import type { UserSettingsGetters, UserSettingsState } from './types';

export const getters: GetterTree<UserSettingsState, RootState> & UserSettingsGetters = {
  // This getter is relevant to have a standardized default value that works for
  // all component which interact with such provider options.
  getEthereumProviderOptions: (state) => (providerName) => {
    return state.ethereumProviderOptions[providerName] ?? {};
  },
};
