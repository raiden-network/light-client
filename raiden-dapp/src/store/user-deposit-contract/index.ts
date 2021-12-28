import type { Module } from 'vuex';

import { mutations } from './mutations';
import state from './state';
import type { RootStateWithUserDepositContract, UserDepositContractState } from './types';

export const userDepositContract: Module<
  UserDepositContractState,
  RootStateWithUserDepositContract
> = {
  namespaced: true,
  mutations,
  state,
};

export * from './types';
