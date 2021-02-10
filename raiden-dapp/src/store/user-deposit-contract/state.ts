import type { UserDepositContractState } from './types';

export const defaultState = (): UserDepositContractState => ({
  tokenAddress: '',
  token: undefined,
  plannedWithdrawal: undefined,
});

const state: UserDepositContractState = defaultState();

export default state;
