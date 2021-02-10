import type { Module } from 'vuex';

import type { RootState } from '@/types';

import { mutations } from './mutations';
import state from './state';
import type { UserDepositContractState } from './types';

export const userDepositContract: Module<UserDepositContractState, RootState> = {
  namespaced: true,
  mutations,
  state,
};

export * from './types';
