/* eslint-disable @typescript-eslint/no-explicit-any */
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';
import { $identicon } from '../../utils/mocks';
import { generateToken } from '../../utils/data-generator';
import UDC from '@/views/account/UDC.vue';
import Filters from '@/filters';

Vue.filter('displayFormat', Filters.displayFormat);

Vue.use(Vuetify);
Vue.use(Vuex);

const token = generateToken();

async function createWrapper(
  mainnet = false,
  usingRaidenAccount = false,
  udcCapacity = constants.Zero,
  monitoringReward = constants.One,
): Promise<Wrapper<UDC>> {
  const vuetify = new Vuetify();

  const $raiden = {
    getUDCCapacity: jest.fn().mockResolvedValue(udcCapacity),
    monitoringReward: monitoringReward,
    getMainAccount: jest.fn(),
    getAccount: jest.fn(),
  };

  const state = {
    accountBalance: '0',
    raidenAccountBalance: '0',
  };

  const getters = {
    mainnet: () => mainnet,
    usingRaidenAccount: () => usingRaidenAccount,
  };

  const userDepositContractModule = {
    namespaced: true,
    state: { token },
  };

  const store = new Vuex.Store({
    state,
    getters,
    modules: { userDepositContract: userDepositContractModule },
  });

  const wrapper = mount(UDC, {
    vuetify,
    store,
    stubs: ['v-dialog'],
    mocks: {
      $identicon: $identicon(),
      $t: (msg: string) => msg,
      $raiden,
    },
  });

  // There is an asynchronous `mounted` lifecycle hook function.
  await flushPromises();
  return wrapper;
}

async function clickActionButton(wrapper: Wrapper<UDC>, index: number): Promise<void> {
  const button = wrapper.findAll('button').at(index);
  button.trigger('click');
  await wrapper.vm.$nextTick();
}

describe('UDC.vue', () => {
  test('display balance too low hint', async () => {
    const wrapper = await createWrapper(undefined, undefined, constants.One, constants.Two);
    const text = wrapper.text();

    expect(text).toContain('udc.balance-too-low');
    expect(text).toContain('0.0');
  });

  test('do not show hint if balance is sufficient', async () => {
    const wrapper = await createWrapper(undefined, undefined, constants.Two, constants.One);
    const text = wrapper.text();

    expect(text).not.toContain('udc.balance-too-low');
  });

  test('clicking deposit enables deposit dialog', async () => {
    const wrapper = await createWrapper();
    expect(wrapper.vm.$data.showUdcDeposit).toBe(false);

    await clickActionButton(wrapper, 0);

    expect(wrapper.vm.$data.showUdcDeposit).toBe(true);
  });

  test('clicking withdrawal button enables withdrawal dialog', async () => {
    const wrapper = await createWrapper();
    expect(wrapper.vm.$data.withdrawFromUdc).toBe(false);

    await clickActionButton(wrapper, 1);

    expect(wrapper.vm.$data.withdrawFromUdc).toBe(true);
  });

  test('mintDone method closes the deposit dialog', async () => {
    const wrapper = await createWrapper();
    jest.spyOn(wrapper.vm as any, 'mintDone');

    await clickActionButton(wrapper, 0);
    expect(wrapper.vm.$data.showUdcDeposit).toBe(true);

    (wrapper.vm as any).mintDone();
    expect((wrapper.vm as any).mintDone).toHaveBeenCalled();
    expect(wrapper.vm.$data.showUdcDeposit).toBe(false);
  });
});
