import { constants } from 'ethers';

import { mutations } from '@/store/user-deposit-contract/mutations';
import { defaultState } from '@/store/user-deposit-contract/state';
import type { PlannedUdcWithdrawal } from '@/store/user-deposit-contract/types';

import { generateToken } from '../../utils/data-generator';

const token = generateToken();

const plannedWithdrawal: PlannedUdcWithdrawal = {
  txHash: '0xTxHash',
  txBlock: 1,
  amount: constants.One,
  withdrawableAfter: 5,
  confirmed: undefined,
};

describe('user deposit contract store mutations', () => {
  test('can set token address', () => {
    const state = defaultState();
    expect(state.tokenAddress).toBe('');

    mutations.setTokenAddress(state, token.address);

    expect(state.tokenAddress).toBe(token.address);
  });

  test('can set token', () => {
    const state = defaultState();
    expect(state.token).toBeUndefined();

    mutations.setToken(state, token);

    expect(state.token).toBe(token);
  });

  test('can set planned withdrawal', () => {
    const state = defaultState();
    expect(state.plannedWithdrawal).toBeUndefined();

    mutations.setPlannedWithdrawal(state, plannedWithdrawal);

    expect(state.plannedWithdrawal).toBe(plannedWithdrawal);
  });

  test('can clear planned withdrawal', () => {
    const state = { ...defaultState(), plannedWithdrawal };

    mutations.clearPlannedWithdrawal(state);

    expect(state.plannedWithdrawal).toBeUndefined();
  });
});
