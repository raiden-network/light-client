/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import ConnectionManager from '@/components/ConnectionManager.vue';
import RaidenService, { raidenServiceConnectMock } from '@/services/__mocks__/raiden-service';
import { DirectRpcProvider } from '@/services/ethereum-provider/__mocks__/direct-rpc-provider';

jest.mock('@/services/ethereum-provider/direct-rpc-provider');
jest.mock('@/services/config-provider');

Vue.use(Vuetify);
Vue.use(Vuex);

const vuetify = new Vuetify();
const storeCommitMock = jest.fn();

function createWrapper(): Wrapper<ConnectionManager> {
  const state = {
    isConnected: false,
    stateBackup: '',
  };

  const userSettingsModule = {
    namespaced: true,
    state: { useRaidenAccount: true },
  };

  const store = new Store({ state, modules: { userSettings: userSettingsModule } });
  const $raiden = new RaidenService();

  store.commit = storeCommitMock;

  return shallowMount(ConnectionManager, {
    vuetify,
    store,
    mocks: {
      $raiden,
      $t,
    },
    stubs: {
      'action-button': ActionButton,
    },
  });
}

async function clickConnectButton(wrapper: Wrapper<ConnectionManager>): Promise<void> {
  const button = wrapper.findComponent(ActionButton).find('button');
  button.trigger('click');
  await flushPromises();
}

describe('ConnectionManager.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VUE_APP_ALLOW_MAINNET;
  });

  test('clicking on the connect button calls the raiden service to connect', async () => {
    const wrapper = createWrapper();
    await clickConnectButton(wrapper);
    expect(raidenServiceConnectMock).toHaveBeenCalledTimes(1);
  });

  test('clicking on the connect button resets the store its state', async () => {
    const wrapper = createWrapper();
    await clickConnectButton(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('reset');
  });

  test('clicking on the connect button sets the store to being connected', async () => {
    const wrapper = createWrapper();
    await clickConnectButton(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('setConnected');
  });

  test('clicking on the connect button clears the state backup in the store', async () => {
    const wrapper = createWrapper();
    await clickConnectButton(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('clearBackupState');
  });

  test('show error when no provider got configured', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).getProvider = jest.fn().mockResolvedValue(undefined);

    await clickConnectButton(wrapper);

    const errorMessage = wrapper.find('#connection-manager__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toBe('error-codes.no-ethereum-provider');
    expect(raidenServiceConnectMock).not.toHaveBeenCalled();
  });

  test('show error when provider of connection links to mainnet but it is not allowed', async () => {
    process.env.VUE_APP_ALLOW_MAINNET = 'false';
    const wrapper = createWrapper();
    (wrapper.vm as any).getProvider = jest
      .fn()
      .mockResolvedValue(await DirectRpcProvider.link({ chainId: 1 }));

    await clickConnectButton(wrapper);

    const errorMessage = wrapper.find('#connection-manager__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toBe('error-codes.unsupported-network');
    expect(raidenServiceConnectMock).not.toHaveBeenCalled();
  });

  test('accept that provider of connection links to mainnet if it is allowed', async () => {
    process.env.VUE_APP_ALLOW_MAINNET = 'true';
    const wrapper = createWrapper();
    (wrapper.vm as any).getConnection = jest
      .fn()
      .mockResolvedValue(await DirectRpcProvider.link({ chainId: 1 }));

    await clickConnectButton(wrapper);

    const errorMessage = wrapper.find('#connection-manager__error-message');
    expect(errorMessage.exists()).toBeFalsy();
    expect(raidenServiceConnectMock).toHaveBeenCalled();
  });

  test('show error when raiden service connection throws', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).$raiden.connect = jest
      .fn()
      .mockRejectedValue(new Error('No deploy info provided'));

    await clickConnectButton(wrapper);

    const errorMessage = wrapper.find('#connection-manager__error-message');
    expect(errorMessage.exists()).toBeTruthy();
  });
});
