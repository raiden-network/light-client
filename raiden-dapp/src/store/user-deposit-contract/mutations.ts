import type { MutationTree } from 'vuex';

import type { Token } from '@/model/types';

import type { PlannedUdcWithdrawal, UserDepositContractState } from './types';

export const mutations: MutationTree<UserDepositContractState> = {
  setTokenAddress(state, address: string) {
    state.tokenAddress = address;
  },
  setToken(state, token: Token) {
    state.token = token;
  },
  setPlannedWithdrawal(state, plannedWithdrawal: PlannedUdcWithdrawal) {
    state.plannedWithdrawal = plannedWithdrawal;
  },
  clearPlannedWithdrawal(state) {
    state.plannedWithdrawal = undefined;
  },
};
