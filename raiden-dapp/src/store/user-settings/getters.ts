import type { GetterTree } from 'vuex';

import type { EthereumConnectionOptions } from '@/services/ethereum-connection';
import type { RootState } from '@/types';

import type { UserSettingsState } from './types';

type Getters = {
  getEthereumConnectionOptions(
    state: UserSettingsState,
  ): (connectionName: string) => EthereumConnectionOptions;
};

export const getters: GetterTree<UserSettingsState, RootState> & Getters = {
  // This getter is relevant to have a standardized default value that works for
  // all component which interact with such connection options.
  getEthereumConnectionOptions: (state) => (connectionName) => {
    return state.ethereumConnectionOptions[connectionName] ?? {};
  },
};
