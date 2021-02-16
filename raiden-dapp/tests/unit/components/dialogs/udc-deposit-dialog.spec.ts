/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { BigNumber, constants } from 'ethers';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';

import { generateToken } from '../../utils/data-generator';

Vue.use(Vuetify);
Vue.use(Vuex);

const $raiden = {
  mint: jest.fn(),
  depositToUDC: jest.fn(async (_, call: () => void) => call()),
  getMainAccount: jest.fn(),
  getAccount: jest.fn(),
};

function createWrapper(mainnet = false, balance = constants.Zero): Wrapper<UdcDepositDialog> {
  const vuetify = new Vuetify();
  const token = generateToken({ balance });

  const getters = {
    mainnet: () => mainnet,
  };

  const userDepositContractModule = {
    namespaced: true,
    state: { token },
  };

  const store = new Vuex.Store({
    getters,
    modules: { userDepositContract: userDepositContractModule },
  });

  return mount(UdcDepositDialog, {
    vuetify,
    store,
    stubs: ['v-dialog'],
    mocks: {
      $t: (msg: string) => msg,
      $raiden,
    },
    propsData: {
      visible: true,
    },
  });
}

async function clickActionButton(wrapper: Wrapper<UdcDepositDialog>): Promise<void> {
  await wrapper.vm.$nextTick(); // Else the button does not get enabled.
  wrapper.find('.udc-deposit-dialog__action button').trigger('click');
  await flushPromises();
}

async function setAmount(wrapper: Wrapper<UdcDepositDialog>, amount: string): Promise<void> {
  await wrapper.vm.$nextTick();
  const inputField = wrapper.find('input');
  inputField.setValue(amount);
  await wrapper.vm.$nextTick();
}

describe('UdcDepositDialog.vue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('depositing on testnet', () => {
    test('emit a done event when the mint and deposit is successful', async () => {
      expect.assertions(3);
      const wrapper = createWrapper();

      await clickActionButton(wrapper);

      expect($raiden.mint).toHaveBeenCalledTimes(1);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted()['done']).toHaveLength(1);
    });

    expect.assertions(3);
    test('show an error message when the minting fails', async () => {
      $raiden.mint.mockRejectedValueOnce(new Error('error'));
      const wrapper = createWrapper();

      await clickActionButton(wrapper);

      expect($raiden.mint).toHaveBeenCalledTimes(1);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(0);
      expect(wrapper.vm.$data.error).toMatchObject({ message: 'error' });
    });

    test('do not mint when the user has already enough tokens', async () => {
      expect.assertions(3);
      const wrapper = createWrapper(undefined, BigNumber.from('10000000000000000000'));

      await clickActionButton(wrapper);

      expect($raiden.mint).toHaveBeenCalledTimes(0);
      expect($raiden.depositToUDC).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted()['done']).toHaveLength(1);
    });
  });

  describe('depositing on mainnet', () => {
    test('displays uniswap URL', () => {
      const wrapper = createWrapper(true);
      expect(wrapper.vm.$data.uniswapURL).toBeDefined();
    });

    test('amount validates to true if inputted amount is lower or equal to available amount', async () => {
      const wrapper = createWrapper(true, BigNumber.from('20000000000000000000'));

      await setAmount(wrapper, '5.55');
      expect((wrapper.vm as any).valid).toBe(true);

      await setAmount(wrapper, '20');
      expect((wrapper.vm as any).valid).toBe(true);
    });

    test('amount validates to false if inputted amount is higher than available amount', async () => {
      const wrapper = createWrapper(true, BigNumber.from('10000000000000000000'));

      await setAmount(wrapper, '20');
      expect((wrapper.vm as any).valid).toBe(false);
    });
  });
});
