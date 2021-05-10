import { mutations } from '@/store/user-settings/mutations';
import { defaultState } from '@/store/user-settings/state';

describe('user setttings store mutations', () => {
  test('can enable raiden account usage', () => {
    const state = defaultState();
    state.useRaidenAccount = false;

    mutations.enableRaidenAccount(state);

    expect(state.useRaidenAccount).toBe(true);
  });

  test('can disable raiden account usage', () => {
    const state = defaultState();
    expect(state.useRaidenAccount).toBe(true);

    mutations.disableRaidenAccount(state);

    expect(state.useRaidenAccount).toBe(false);
  });

  test('can save ethereum provider options', () => {
    const state = defaultState();
    expect(state.ethereumProviderOptions['test_provider']).toBeUndefined();

    const payload = { providerName: 'test_provider', providerOptions: { option: 'test' } };
    mutations.saveEthereumProviderOptions(state, payload);

    expect(state.ethereumProviderOptions['test_provider']).toMatchObject({ option: 'test' });
  });
});
