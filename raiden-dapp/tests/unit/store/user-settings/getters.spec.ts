import { getters } from '@/store/user-settings/getters';
import { defaultState } from '@/store/user-settings/state';

describe('user settings store getters', () => {
  test('get empty options for etherum connections per default', () => {
    const state = defaultState();

    expect(getters.getEthereumConnectionOptions(state)('test_connection')).toMatchObject({});
  });

  test('get saved options for etherum connections', () => {
    const state = defaultState();
    state.ethereumConnectionOptions['test_connection'] = { option: 'test' };

    expect(getters.getEthereumConnectionOptions(state)('test_connection')).toMatchObject({
      option: 'test',
    });
  });
});
