import { generateToken } from '../../utils/data-generator';
import { mutations } from '@/store/user-deposit-contract/mutations';
import { defaultState } from '@/store/user-deposit-contract/state';

const token = generateToken();

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
});
