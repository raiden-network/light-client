import { Module } from 'vuex';
import { mutations } from './mutations';
import state from './state';
import { UserDepositContractState } from './types';
import { RootState } from '@/types';

export const userDepositContract: Module<UserDepositContractState, RootState> = {
  namespaced: true,
  mutations,
  state,
};

export * from './types';
