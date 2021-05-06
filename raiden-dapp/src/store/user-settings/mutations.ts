import type { MutationTree } from 'vuex';

import type { UserSettingsState } from './types';

export const mutations: MutationTree<UserSettingsState> = {
  enableRaidenAccount(state) {
    state.useRaidenAccount = true;
  },
  disableRaidenAccount(state) {
    state.useRaidenAccount = false;
  },
};
