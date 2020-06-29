import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';
import { $identicon } from '../../utils/mocks';
import UDC from '@/views/account/UDC.vue';
import { Zero } from 'ethers/constants';
import { Token } from '@/model/types';
import Filters from '@/filters';
import { bigNumberify } from 'ethers/utils';
import flushPromises from 'flush-promises';

Vue.filter('displayFormat', Filters.displayFormat);

Vue.use(Vuetify);

describe('UDC.vue', () => {
  let wrapper: Wrapper<UDC>;
  let vuetify: typeof Vuetify;
  let $raiden: any;
  const token = {
    address: '0x1234',
    name: 'Service Token',
    symbol: 'SVT',
    decimals: 18,
    balance: Zero,
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
      userDepositTokenAddress: '0x1234',
      fetchTokenData: jest.fn(),
      getUDCCapacity: jest.fn().mockResolvedValue(bigNumberify('5000')),
      monitoringReward: bigNumberify('500'),
      mint: jest.fn(),
      depositToUDC: jest.fn(),
    };
    store.commit('userDepositTokenAddress', '0x1234');
    store.commit('updateTokens', { '0x1234': token });
    wrapper = createWrapper();

    await wrapper.vm.$nextTick();
    await flushPromises();
  });

  test('display balance too low hint', async () => {
    $raiden = {
      userDepositTokenAddress: '0x1234',
      fetchTokenData: jest.fn(),
      getUDCCapacity: jest.fn().mockResolvedValue(Zero),
      monitoringReward: bigNumberify('500'),
    };
    wrapper = createWrapper();

    await wrapper.vm.$nextTick();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('udc.balance-too-low');
    expect(text).toContain('0.0');
  });

  test('dont show hint if balance is sufficient', async () => {
    const text = wrapper.text();
    expect(text).not.toContain('udc.balance-too-low');
  });

  test('mints and deposits to UDC', async () => {
    wrapper.find('.udc__action button').trigger('click');
    expect(wrapper.vm.$data.loading).toBe(true);

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.vm.$data.loading).toBe(false);
  });

  test('clicking withdrawal button enables withdrawal dialog', async () => {
    expect(wrapper.vm.$data.withdrawFromUdc).toBe(false);

    const withdrawalButton = wrapper.find('.udc__withdrawal-button');
    withdrawalButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.withdrawFromUdc).toBe(true);
  });
});
