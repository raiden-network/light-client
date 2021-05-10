import type { MutationTree } from 'vuex';

import type { EthereumProviderOptions } from '@/services/ethereum-provider';

import type { UserSettingsState } from './types';

export const mutations: MutationTree<UserSettingsState> = {
  enableRaidenAccount(state) {
    state.useRaidenAccount = true;
  },
  disableRaidenAccount(state) {
    state.useRaidenAccount = false;
  },
  saveEthereumProviderOptions(
    state,
    payload: {
      providerName: string;
      providerOptions: EthereumProviderOptions;
    },
  ) {
    state.ethereumProviderOptions[payload.providerName] = payload.providerOptions;
  },
};
