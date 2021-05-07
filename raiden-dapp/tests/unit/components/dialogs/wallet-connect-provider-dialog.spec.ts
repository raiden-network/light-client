import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import ActionButton from '@/components/ActionButton.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';

Vue.use(Vuetify);

const createWrapper = (): Wrapper<WalletConnectProviderDialog> => {
  const vuetify = new Vuetify();

  return mount(WalletConnectProviderDialog, {
    vuetify,
    stubs: { 'v-dialog': true, 'action-button': ActionButton },
    mocks: {
      $t: (msg: string) => msg,
    },
    propsData: {
      visible: true,
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

describe('WalletConnectProviderDialog.vue', () => {
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

  // TODO: more tests to come. But for the moment the features of this
  // component are too unstable as we have to figure out how the dialogs
  // interact with the connection manager. Therefore it makes no sense to test
  // anything beyond what is very specific to this dialog for the moment.
});
