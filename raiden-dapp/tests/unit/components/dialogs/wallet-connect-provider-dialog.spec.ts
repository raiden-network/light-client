/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { WalletConnectProvider } from '@/services/ethereum-provider';

jest.mock('@/services/ethereum-provider/wallet-connect-provider');

Vue.use(Vuex);
Vue.use(Vuetify);

const vuetify = new Vuetify();
const saveEthereumProviderOptionsMock = jest.fn();

function createWrapper(options?: {
  infuraId?: string;
  bridgeUrl?: string;
}): Wrapper<WalletConnectProviderDialog> {
  const getters = {
    getEthereumProviderOptions: () => () => ({
      infuraId: options?.infuraId,
      bridgeUrl: options?.bridgeUrl,
    }),
  };

  const mutations = {
    saveEthereumProviderOptions: saveEthereumProviderOptionsMock,
  };

  const userSettings = {
    namespaced: true,
    getters,
    mutations,
  };

  const store = new Vuex.Store({
    modules: { userSettings },
  });

  return mount(WalletConnectProviderDialog, {
    vuetify,
    store,
    stubs: { 'action-button': ActionButton },
    mocks: { $t },
  });
}

async function clickBridgeUrlOptionToggle(
  wrapper: Wrapper<WalletConnectProviderDialog>,
): Promise<void> {
  const bridgeUrlOptionToggle = wrapper
    .get('.wallet-connect-provider__options__bridge-url')
    .findAll('input')
    .at(0);
  bridgeUrlOptionToggle.trigger('click');
  await wrapper.vm.$nextTick();
}

async function insertBridgeUrlOption(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  input = 'testUrl',
): Promise<void> {
  const bridgeUrlInputOption = wrapper
    .get('.wallet-connect-provider__options__bridge-url')
    .findAll('input')
    .at(1);
  (bridgeUrlInputOption.element as HTMLInputElement).value = input;
  bridgeUrlInputOption.trigger('input');
  await wrapper.vm.$nextTick();
}

async function selectInfuraIdOption(wrapper: Wrapper<WalletConnectProviderDialog>): Promise<void> {
  const infuraIdOptionToggle = wrapper
    .findAll('.wallet-connect-provider__option-toggle-button')
    .at(0);
  infuraIdOptionToggle.trigger('click');
  await wrapper.vm.$nextTick();
}

async function insertInfuraIdOption(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  input = 'testId',
): Promise<void> {
  await selectInfuraIdOption(wrapper);
  const infuraIdInputOption = wrapper
    .get('.wallet-connect-provider__options__infura-id')
    .find('input');
  (infuraIdInputOption.element as HTMLInputElement).value = input;
  infuraIdInputOption.trigger('input');
  await wrapper.vm.$nextTick();
}

async function selectRpcUrlOption(wrapper: Wrapper<WalletConnectProviderDialog>): Promise<void> {
  const rpcUrlOptionToggle = wrapper
    .findAll('.wallet-connect-provider__option-toggle-button')
    .at(1);
  rpcUrlOptionToggle.trigger('click');
  await wrapper.vm.$nextTick();
}

async function insertRpcUrlOption(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  input: string,
): Promise<void> {
  await selectRpcUrlOption(wrapper);
  const rpcUrlInputOption = wrapper
    .get('.wallet-connect-provider__options__rpc-url')
    .find('input');
  (rpcUrlInputOption.element as HTMLInputElement).value = input;
  rpcUrlInputOption.trigger('input');
  await wrapper.vm.$nextTick();
}

async function clickLinkButton(wrapper: Wrapper<WalletConnectProviderDialog>): Promise<void> {
  const button = wrapper.findComponent(ActionButton).get('button');
  button.trigger('click');
  await flushPromises();
}

describe('WalletConnectProviderDialog.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('can toggle between Infura ID and RPC URL option', async () => {
    const wrapper = createWrapper();
    let infuraIdOption = wrapper.get('.wallet-connect-provider__options__infura-id');
    expect(infuraIdOption.isVisible()).toBeTruthy();

    await selectRpcUrlOption(wrapper);
    const rpcUrlOption = wrapper.get('.wallet-connect-provider__options__rpc-url');
    expect(rpcUrlOption.isVisible()).toBeTruthy();

    await selectInfuraIdOption(wrapper);
    infuraIdOption = wrapper.get('.wallet-connect-provider__options__infura-id');
    expect(infuraIdOption.isVisible()).toBeTruthy();
  });

  test('can link with Infura ID option only', async () => {
    const wrapper = createWrapper();

    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({ infuraId: 'testId' });
  });

  test('can link with RPC URL option only', async () => {
    const wrapper = createWrapper();

    await insertRpcUrlOption(wrapper, 'https://some.rpc.endpoint');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      rpcUrl: 'https://some.rpc.endpoint',
    });
  });

  test('can link with optional bridge URL option', async () => {
    const wrapper = createWrapper();

    await clickBridgeUrlOptionToggle(wrapper);
    await insertBridgeUrlOption(wrapper, 'https://some.bridge.server');
    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      bridgeUrl: 'https://some.bridge.server',
      infuraId: 'testId',
    });
  });

  test('successful link emits linked provider instance', async () => {
    const wrapper = createWrapper();

    await insertInfuraIdOption(wrapper);
    await clickLinkButton(wrapper);

    expect(wrapper.emitted().linkEstablished?.length).toBe(1);
  });

  test('shows error when linking fails', async () => {
    const wrapper = createWrapper();
    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOption(wrapper);
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toMatch(
      'connection-manager.dialogs.wallet-connect-provider.error-message',
    );
  });

  test('linking again after error hides error message', async () => {
    const wrapper = createWrapper();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOption(wrapper);
    await clickLinkButton(wrapper);

    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();

    // Failing mock was only **once**.
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();
  });

  test('can link with saved provider options from store', async () => {
    const wrapper = createWrapper({ infuraId: 'testId', bridgeUrl: 'https://some.bridge.server' });

    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      bridgeUrl: 'https://some.bridge.server',
      infuraId: 'testId',
    });
  });

  test('successful link saves provider options to store', async () => {
    const wrapper = createWrapper();

    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(saveEthereumProviderOptionsMock).toHaveBeenCalledTimes(1);
    expect(saveEthereumProviderOptionsMock).toHaveBeenCalledWith(expect.anything(), {
      providerName: 'wallet_connect_mock',
      providerOptions: { infuraId: 'testId' },
    });
  });
});
