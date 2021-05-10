import type { GetterTree } from 'vuex';

import type { EthereumProviderOptions } from '@/services/ethereum-provider';
import type { RootState } from '@/types';

import type { UserSettingsState } from './types';

type Getters = {
  getEthereumProviderOptions(
    state: UserSettingsState,
  ): (providerName: string) => EthereumProviderOptions;
};

export const getters: GetterTree<UserSettingsState, RootState> & Getters = {
  // This getter is relevant to have a standardized default value that works for
  // all component which interact with such provider options.
  getEthereumProviderOptions: (state) => (providerName) => {
    return state.ethereumProviderOptions[providerName] ?? {};
  },
};
