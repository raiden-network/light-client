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
import { DirectRpcProvider, InjectedProvider } from '@/services/ethereum-provider';
import RaidenService from '@/services/raiden-service';

jest.mock('@/services/ethereum-provider/direct-rpc-provider');
jest.mock('@/services/ethereum-provider/injected-provider');
jest.mock('@/services/raiden-service');
jest.mock('@/services/config-provider');

Vue.use(Vuetify);
Vue.use(Vuex);

const vuetify = new Vuetify();
const storeCommitMock = jest.fn();
const $raiden = new (RaidenService as any)();

function createWrapper(options?: {
  isConnected?: boolean;
  stateBackup?: string;
  useRaidenAccount?: boolean;
  inProgress?: boolean;
}): Wrapper<ConnectionManager> {
  const state = {
    isConnected: options?.isConnected ?? false,
    stateBackup: options?.stateBackup ?? '',
  };

  const userSettingsModule = {
    namespaced: true,
    state: { useRaidenAccount: options?.useRaidenAccount ?? false },
  };

  const store = new Store({ state, modules: { userSettings: userSettingsModule } });

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

/*
 * Unfortunately we can't easily test a "real" event call by a child component.
 * But after all this is just a property of the dialogs. Thereby it is fine to
 * test the callback directly here.
 */
async function dialogEmitLinkEstablished(
  wrapper: Wrapper<ConnectionManager>,
  options?: { chainId?: number },
): Promise<void> {
  const linkedProvider = await (DirectRpcProvider as any).link(options);
  await (wrapper.vm as any).onProviderLinkEstablished(linkedProvider);
  await wrapper.vm.$nextTick();
  await flushPromises();
}

describe('ConnectionManager.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VUE_APP_ALLOW_MAINNET;
  });

  test('can not connect when already being connected', () => {
    // Note that this is a theoretical case that should not be possible via the
    // UI. Though it is important, so it must be guaranteed.
    expect.assertions(1);
    const wrapper = createWrapper({ isConnected: true });
    expect(dialogEmitLinkEstablished(wrapper)).rejects.toThrowError('Can only connect once!');
  });

  test('when a provider link got established the raiden service gets connected', async () => {
    const wrapper = createWrapper();
    await dialogEmitLinkEstablished(wrapper);
    expect($raiden.connect).toHaveBeenCalledTimes(1);
  });

  test('when a provider link got established the store state gets reset', async () => {
    const wrapper = createWrapper();
    await dialogEmitLinkEstablished(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('reset');
  });

  test('when the raiden service connects successfully the store state get set to be connected', async () => {
    const wrapper = createWrapper();
    await dialogEmitLinkEstablished(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('setConnected');
  });

  test('uses the user settings to connect the raiden service', async () => {
    const wrapper = createWrapper({ useRaidenAccount: true });
    await dialogEmitLinkEstablished(wrapper);
    expect($raiden.connect).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
    );
  });

  test('uses the state backup of the user to connect the raiden service', async () => {
    const wrapper = createWrapper({ stateBackup: 'testBackup' });
    await dialogEmitLinkEstablished(wrapper);
    expect($raiden.connect).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      'testBackup',
      expect.anything(),
      undefined, // Can't be anything (is the "false" useRaidenAccount)
    );
  });

  test('when the connection was successful the state backup in the store gets cleared', async () => {
    const wrapper = createWrapper();
    await dialogEmitLinkEstablished(wrapper);
    expect(storeCommitMock).toHaveBeenCalledWith('clearBackupState');
  });

  test('show error when provider links to mainnet but it is not allowed', async () => {
    const wrapper = createWrapper();
    let errorMessage = wrapper.find('.connection-manager__error-message');
    expect(errorMessage.text().length).toBe(0); // For some reason does `isVisible` not work here.

    process.env.VUE_APP_ALLOW_MAINNET = 'false';
    await dialogEmitLinkEstablished(wrapper, { chainId: 1 });

    errorMessage = wrapper.find('.connection-manager__error-message');
    expect(errorMessage.text()).toBe('error-codes.unsupported-network');
    expect($raiden.connect).not.toHaveBeenCalled();
  });

  test('accept that provider of connection links to mainnet if it is allowed', async () => {
    const wrapper = createWrapper();

    process.env.VUE_APP_ALLOW_MAINNET = 'true';
    await dialogEmitLinkEstablished(wrapper, { chainId: 1 });

    const errorMessage = wrapper.find('.connection-manager__error-message');
    expect(errorMessage.text().length).toBe(0); // For some reason does `isVisible` not work here.
    expect($raiden.connect).toHaveBeenCalled();
  });

  test('show error when raiden service connection throws', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).$raiden.connect = jest
      .fn()
      .mockRejectedValue(new Error('No deploy info provided'));

    await dialogEmitLinkEstablished(wrapper);

    const errorMessage = wrapper.find('.connection-manager__error-message');
    expect(errorMessage.text().length).toBeGreaterThan(0); // For some reason does `isVisible` not work here.
  });

  test('provider dialog button is enabled if provider is available', () => {
    jest.spyOn(InjectedProvider, 'isAvailable', 'get').mockReturnValueOnce(true);
    const wrapper = createWrapper();

    const providerDialogButton = wrapper
      .findAll('.connection-manager__provider-dialog-button')
      .at(1)
      .get('button');

    expect(providerDialogButton.attributes('disabled')).toBeFalsy();
  });

  test('provider dialog button is disabled if provider is not available', () => {
    jest.spyOn(InjectedProvider, 'isAvailable', 'get').mockReturnValueOnce(false);
    const wrapper = createWrapper();

    const providerDialogButton = wrapper
      .findAll('.connection-manager__provider-dialog-button')
      .at(0)
      .get('button');

    expect(providerDialogButton.attributes('disabled')).toBeTruthy();
  });
});
