import { createLocalVue } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vuex, { Store } from 'vuex';

import type { RootStateWithUserSettings } from '@/store/user-settings';
import { createUserSettingsPersistencePlugin, userSettings } from '@/store/user-settings';
import { defaultState } from '@/store/user-settings/state';

import { MockedLocalStorage } from '../../utils/mocks/local-storage';

const localVue = createLocalVue();
localVue.use(Vuex);

function createStore(storage: Storage): Store<RootStateWithUserSettings> {
  const plugin = createUserSettingsPersistencePlugin(storage);

  return new Store({
    modules: { userSettings },
    plugins: [plugin],
  });
}

describe('user settings store persistence', () => {
  test('write default user settings on first initialization', async () => {
    const storage = new MockedLocalStorage({
      /* empty */
    });
    const store = createStore(storage);

    store.commit('userSettings/enableRaidenAccount');
    await flushPromises();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'raiden_dapp_settings',
      JSON.stringify({ userSettings: defaultState() }),
    );
  });

  test('write user settings to storage when enabling raiden account', () => {
    const storage = new MockedLocalStorage();
    const store = createStore(storage);

    store.commit('userSettings/enableRaidenAccount');

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'raiden_dapp_settings',
      JSON.stringify({
        userSettings: {
          ...defaultState(),
          useRaidenAccount: true,
        },
      }),
    );
  });

  test('write user settings to storage when disabling raiden account', () => {
    const storage = new MockedLocalStorage();
    const store = createStore(storage);

    store.commit('userSettings/disableRaidenAccount');

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'raiden_dapp_settings',
      JSON.stringify({
        userSettings: {
          ...defaultState(),
          useRaidenAccount: false,
        },
      }),
    );
  });

  test('write user settings to storage when saving Ethereum provider options', () => {
    const storage = new MockedLocalStorage();
    const store = createStore(storage);

    store.commit('userSettings/saveEthereumProviderOptions', {
      providerName: 'testProvider',
      providerOptions: 'fake-options',
    });

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      'raiden_dapp_settings',
      JSON.stringify({
        userSettings: {
          ...defaultState(),
          ethereumProviderOptions: { testProvider: 'fake-options' },
        },
      }),
    );
  });

  test('read user settings from storage on initialization', () => {
    const raiden_dapp_settings = {
      userSettings: {
        useRaidenAccount: false,
        ethereumProviderOptions: { testProvider: 'fake-options' },
      },
    };
    const storage = new MockedLocalStorage({ raiden_dapp_settings });
    const store = createStore(storage);

    expect(store.state.userSettings.useRaidenAccount).toBeFalsy();
    expect(store.state.userSettings.ethereumProviderOptions).toMatchObject({
      testProvider: 'fake-options',
    });
  });
});
