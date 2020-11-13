import { MutationTree } from 'vuex';
import { UserDepositContractState, PlannedUdcWithdrawal } from './types';
import { Token } from '@/model/types';

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
