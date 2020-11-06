/* eslint-disable @typescript-eslint/no-explicit-any */
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { BigNumber, constants } from 'ethers';
import flushPromises from 'flush-promises';
import { $identicon } from '../../utils/mocks';
import store from '@/store';
import UDC from '@/views/account/UDC.vue';
import { Token } from '@/model/types';
import Filters from '@/filters';
import RaidenService from '@/services/raiden-service';

Vue.filter('displayFormat', Filters.displayFormat);

Vue.use(Vuetify);

describe('UDC.vue', () => {
  let wrapper: Wrapper<UDC>;
  let vuetify: Vuetify;
  let $raiden: Partial<RaidenService>;
  const token = {
    address: '0x1234',
    name: 'Service Token',
    symbol: 'SVT',
    decimals: 18,
    balance: constants.Zero,
  } as Token;

  function createWrapper() {
    return mount(UDC, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
        $raiden,
      },
    });
  }

  beforeEach(async () => {
    vuetify = new Vuetify();
    $raiden = {
      fetchTokenData: jest.fn(),
      getUDCCapacity: jest.fn().mockResolvedValue(BigNumber.from('5000')),
      monitoringReward: BigNumber.from('500'),
      mint: jest.fn(),
      depositToUDC: jest.fn(),
      getMainAccount: jest.fn(),
      getAccount: jest.fn(),
    };
    store.commit('userDepositTokenAddress', '0x1234');
    store.commit('updateTokens', { '0x1234': token });
    wrapper = createWrapper();

    await wrapper.vm.$nextTick();
    await flushPromises();
  });

  test('display balance too low hint', async () => {
    $raiden.getUDCCapacity = jest.fn().mockResolvedValue(constants.Zero);
    wrapper = createWrapper();

    await wrapper.vm.$nextTick();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('udc.balance-too-low');
    expect(text).toContain('0.0');
  });

  test('do not show hint if balance is sufficient', async () => {
    const text = wrapper.text();
    expect(text).not.toContain('udc.balance-too-low');
  });

  test('clicking deposit enables deposit dialog', async () => {
    expect(wrapper.vm.$data.showUdcDeposit).toBe(false);

    const depositButton = wrapper.findAll('button').at(0);
    depositButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.showUdcDeposit).toBe(true);
  });

  test('clicking withdrawal button enables withdrawal dialog', async () => {
    expect(wrapper.vm.$data.withdrawFromUdc).toBe(false);

    const withdrawalButton = wrapper.findAll('button').at(1);
    withdrawalButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.withdrawFromUdc).toBe(true);
  });

  test('mintDone method closes the deposit dialog', async () => {
    jest.spyOn(wrapper.vm as any, 'mintDone');

    const depositButton = wrapper.findAll('button').at(0);
    depositButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.showUdcDeposit).toBe(true);

    (wrapper.vm as any).mintDone();

    expect((wrapper.vm as any).mintDone).toHaveBeenCalled();
    expect(wrapper.vm.$data.showUdcDeposit).toBe(false);
  });
});
