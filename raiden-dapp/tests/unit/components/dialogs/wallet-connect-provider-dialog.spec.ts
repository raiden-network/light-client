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

async function clickInfuraRpcToggle(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  buttonIndex: number,
): Promise<void> {
  const rpcToggle = wrapper
    .findAll('.wallet-connect-provider__infura-or-rpc__button')
    .at(buttonIndex);
  rpcToggle.trigger('click');
  await wrapper.vm.$nextTick();
}

async function insertInfuraIdOrRpcUrl(
  wrapper: Wrapper<WalletConnectProviderDialog>,
  input = 'an id',
): Promise<void> {
  const infuraOrRpcInput = wrapper.findAll('.wallet-connect-provider__input').at(1).find('input');
  (infuraOrRpcInput.element as HTMLInputElement).value = input;
  infuraOrRpcInput.trigger('input');
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

  test('can toggle between Infura and RPC input', async () => {
    const wrapper = createWrapper();

    wrapper.get('.wallet-connect-provider__infura-or-rpc__details--infura');
    await clickInfuraRpcToggle(wrapper, 1);
    wrapper.get('.wallet-connect-provider__infura-or-rpc__details--rpc');
    await clickInfuraRpcToggle(wrapper, 0);
    wrapper.get('.wallet-connect-provider__infura-or-rpc__details--infura');
  });

  test('can enable bridge server input field', async () => {
    const wrapper = createWrapper();
    const bridgeServerURLInput = wrapper.findAll('.wallet-connect-provider__input').at(0);

    expect(bridgeServerURLInput.attributes('disabled')).toBeTruthy();

    const bridgeServerInputToggle = wrapper
      .find('.wallet-connect-provider__bridge-server__details__toggle')
      .find('input');
    bridgeServerInputToggle.trigger('click');
    await wrapper.vm.$nextTick();

    expect(bridgeServerURLInput.attributes('disabled')).toBeFalsy();
  });

  test('link emits linked provider instance', async () => {
    const wrapper = createWrapper();

    await insertInfuraIdOrRpcUrl(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({ infuraId: 'testId' });
    expect(wrapper.emitted().linkEstablished?.length).toBe(1);
  });

  test('shows error when linking fails', async () => {
    const wrapper = createWrapper();
    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOrRpcUrl(wrapper, 'testId');
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();
    expect(errorMessage.text()).toMatch(
      'connection-manager.dialogs.wallet-connect-provider.error-message',
    );
    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted().linkEstablished).toBeUndefined();
  });

  test('linking again after error hides error message again', async () => {
    const wrapper = createWrapper();

    (WalletConnectProvider as any).link.mockRejectedValueOnce(new Error('canceled'));
    await insertInfuraIdOrRpcUrl(wrapper, 'testId');
    await clickLinkButton(wrapper);

    let errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeTruthy();

    // Failing mock was only **once**.
    await clickLinkButton(wrapper);

    errorMessage = wrapper.find('.wallet-connect-provider__error-message');
    expect(errorMessage.exists()).toBeFalsy();
  });
});
