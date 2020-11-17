import { UserDepositContractState } from './types';

export const defaultState = (): UserDepositContractState => ({
  tokenAddress: '',
  token: undefined,
});

const state: UserDepositContractState = defaultState();

export default state;
