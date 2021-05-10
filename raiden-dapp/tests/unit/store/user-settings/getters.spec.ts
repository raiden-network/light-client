import { getters } from '@/store/user-settings/getters';
import { defaultState } from '@/store/user-settings/state';

describe('user settings store getters', () => {
  test('get empty options for etherum provider per default', () => {
    const state = defaultState();

    expect(getters.getEthereumProviderOptions(state)('test_provider')).toMatchObject({});
  });

  test('get saved options for etherum provider', () => {
    const state = defaultState();
    state.ethereumProviderOptions['test_provider'] = { option: 'test' };

    expect(getters.getEthereumProviderOptions(state)('test_provider')).toMatchObject({
      option: 'test',
    });
  });
});
