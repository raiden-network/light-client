import type { MutationTree } from 'vuex';

import type { EthereumConnectionOptions } from '@/services/ethereum-connection';

import type { UserSettingsState } from './types';

export const mutations: MutationTree<UserSettingsState> = {
  enableRaidenAccount(state) {
    state.useRaidenAccount = true;
  },
  disableRaidenAccount(state) {
    state.useRaidenAccount = false;
  },
  saveEthereumConnectionOptions(
    state,
    payload: {
      connectionName: string;
      connectionOptions: EthereumConnectionOptions;
    },
  ) {
    state.ethereumConnectionOptions[payload.connectionName] = payload.connectionOptions;
  },
};
