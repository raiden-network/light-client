import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { WalletConnectProvider } from '@/services/ethereum-provider';

jest.mock('@/mixins/ethereum-provider-dialog-mixin');
jest.mock('@/services/ethereum-provider/wallet-connect-provider');

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(): Wrapper<WalletConnectProviderDialog> {
  return mount(WalletConnectProviderDialog, {
    vuetify,
    stubs: { 'v-dialog': true, 'action-button': ActionButton },
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
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();

    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      infuraId: 'testId',
    });
    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][0]).toBeInstanceOf(WalletConnectProvider);
  });

  test('can link with RPC URL option only', async () => {
    const wrapper = createWrapper();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();

    await insertRpcUrlOption(wrapper, 'https://some.rpc.endpoint');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      rpcUrl: 'https://some.rpc.endpoint',
    });
    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][0]).toBeInstanceOf(WalletConnectProvider);
  });

  test('can link with optional bridge URL option', async () => {
    const wrapper = createWrapper();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();

    await clickBridgeUrlOptionToggle(wrapper);
    await insertBridgeUrlOption(wrapper, 'https://some.bridge.server');
    await insertInfuraIdOption(wrapper, 'testId');
    await clickLinkButton(wrapper);

    expect(WalletConnectProvider.link).toHaveBeenCalledTimes(1);
    expect(WalletConnectProvider.link).toHaveBeenCalledWith({
      bridgeUrl: 'https://some.bridge.server',
      infuraId: 'testId',
    });
    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][0]).toBeInstanceOf(WalletConnectProvider);
  });
});
