/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { WalletConnectProvider } from '@/services/ethereum-provider/wallet-connect-provider';

jest.mock('@/services/ethereum-provider/wallet-connect-provider');

Vue.use(Vuetify);

const createWrapper = (): Wrapper<WalletConnectProviderDialog> => {
  const vuetify = new Vuetify();

  return mount(WalletConnectProviderDialog, {
    vuetify,
    stubs: { 'v-dialog': true, 'action-button': ActionButton },
    mocks: {
      $t: (msg: string) => msg,
    },
  });
};

async function clickBridgeUrlOptionToggle(
  wrapper: Wrapper<WalletConnectProviderDialog>,
): Promise<void> {
  const bridgeUrlOptionToggle = wrapper
    .get('.wallet-connect-provider__options__bridge-url__toggle')
    .find('input');
  bridgeUrlOptionToggle.trigger('click');
  await wrapper.vm.$nextTick();
}

async function insertBridgeUrlOption(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  input = 'testUrl',
): Promise<void> {
  const bridgeUrlInputOption = wrapper
    .get('.wallet-connect-provider__options__bridge-url__input')
    .find('input');
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
  input: string,
): Promise<void> {
  await selectInfuraIdOption(wrapper);
  const infuraIdInputOption = wrapper
    .get('.wallet-connect-provider__options__infura-id__input')
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
    .get('.wallet-connect-provider__options__rpc-url__input')
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

  test('can enable bridge server input field', async () => {
    const wrapper = createWrapper();
    const bridgeServerURLInput = wrapper.findAll('.wallet-connect-provider__input').at(0);
    expect(bridgeServerURLInput.attributes('disabled')).toBeTruthy();

    await clickBridgeUrlOptionToggle(wrapper);

    expect(bridgeServerURLInput.attributes('disabled')).toBeFalsy();
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
    await insertBridgeUrlOption(wrapper, 'testUrl');
    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      bridgeUrl: 'testUrl',
      infuraId: 'testId',
    });
    expect(wrapper.emitted().linkEstablished?.length).toBe(1);
  });

  test('successful link emits linked provider instance', async () => {
    const wrapper = createWrapper();

    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(wrapper.emitted().linkEstablished?.length).toBe(1);
  });

  test('shows error when linking fails', async () => {
    const wrapper = createWrapper();
    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toMatch(
      'connection-manager.dialogs.wallet-connect-provider.error-message',
    );
    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted().linkEstablished).toBeUndefined();
  });

  test('linking again after error hides error message', async () => {
    const wrapper = createWrapper();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();

    // Failing mock was only **once**.
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();
  });
});
