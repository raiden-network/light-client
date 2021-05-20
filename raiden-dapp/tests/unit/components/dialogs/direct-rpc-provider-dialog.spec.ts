import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import DirectRpcProviderDialog from '@/components/dialogs/DirectRpcProviderDialog.vue';
import { DirectRpcProvider } from '@/services/ethereum-provider';

jest.mock('@/mixins/ethereum-provider-dialog-mixin');
jest.mock('@/services/ethereum-provider/direct-rpc-provider');

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(): Wrapper<DirectRpcProviderDialog> {
  return mount(DirectRpcProviderDialog, {
    vuetify,
    stubs: { 'v-dialog': true, 'action-button': ActionButton },
    mocks: { $t },
  });
}

async function insertRpcUrlOption(
  wrapper: Wrapper<DirectRpcProviderDialog>,
  input = 'testUrl',
): Promise<void> {
  const rpcUrlOption = wrapper.get('.direct-rpc-provider__options__rpc-url').find('input');
  (rpcUrlOption.element as HTMLInputElement).value = input;
  rpcUrlOption.trigger('input');
  await wrapper.vm.$nextTick();
}

async function insertPrivateKeyOption(
  wrapper: Wrapper<DirectRpcProviderDialog>,
  input = 'testKey',
): Promise<void> {
  const privateKeyOption = wrapper.get('.direct-rpc-provider__options__private-key').find('input');
  (privateKeyOption.element as HTMLInputElement).value = input;
  privateKeyOption.trigger('input');
  await wrapper.vm.$nextTick();
}

async function clickLinkButton(wrapper: Wrapper<DirectRpcProviderDialog>): Promise<void> {
  const button = wrapper.findComponent(ActionButton).get('button');
  button.trigger('click');
  await flushPromises();
}

describe('DirectRpcProviderDialog.vue', () => {
  test('can not link with RPC URL option only', async () => {
    const wrapper = createWrapper();

    await insertRpcUrlOption(wrapper);
    await clickLinkButton(wrapper);

    expect(DirectRpcProvider.link).not.toHaveBeenCalled();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();
  });

  test('can not link with private key option only', async () => {
    const wrapper = createWrapper();

    await insertPrivateKeyOption(wrapper);
    await clickLinkButton(wrapper);

    expect(DirectRpcProvider.link).not.toHaveBeenCalled();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();
  });

  test('can link with RPC URL and private key option', async () => {
    const wrapper = createWrapper();

    await insertRpcUrlOption(wrapper, 'url');
    await insertPrivateKeyOption(wrapper, 'key');
    await clickLinkButton(wrapper);

    expect(DirectRpcProvider.link).toHaveBeenCalledTimes(1);
    expect(DirectRpcProvider.link).toHaveBeenCalledWith({ rpcUrl: 'url', privateKey: 'key' });
    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][0]).toBeInstanceOf(DirectRpcProvider);
  });
});
