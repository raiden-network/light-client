import { MutationTree } from 'vuex';
import { UserDepositContractState } from './types';
import { Token } from '@/model/types';

export const mutations: MutationTree<UserDepositContractState> = {
  setTokenAddress(state, address: string) {
    state.tokenAddress = address;
  },
  setToken(state, token: Token) {
    state.token = token;
  },
};
