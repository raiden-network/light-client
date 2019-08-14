jest.mock('vue-router');

jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import { Store } from 'vuex';
import { addElemWithDataAppToBody } from '../utils/dialog';
import { ChannelState, RaidenChannel } from 'raiden';
import { mockInput } from '../utils/interaction-utils';
import { stub } from '../utils/stub';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Payment from '@/views/Payment.vue';
import store from '@/store';
import VueRouter, { Route } from 'vue-router';
import { TestData } from '../data/mock-data';
import RaidenService from '@/services/raiden-service';
import { One, Zero } from 'ethers/constants';

import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('Payment.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<Payment>;
  let router: Mocked<VueRouter>;
  let raiden: Mocked<RaidenService>;
  let loading: jest.SpyInstance;
  let done: jest.SpyInstance;
  let vuetify: typeof Vuetify;

  const token = {
    address: '0xtoken',
    balance: One,
    decimals: 18,
    units: '1.0',
    symbol: 'TTT',
    name: 'Test Token'
  };

  function vueFactory(
    router: VueRouter,
    raiden: RaidenService
  ): Wrapper<Payment> {
    const localVue = createLocalVue();
    vuetify = new Vuetify();

    let options = {
      localVue,
      vuetify,
      store: new Store({
        getters: {
          channelWithBiggestCapacity: jest.fn().mockReturnValue(() => ({
            capacity: One,
            balance: Zero,
            ownDeposit: One,
            partnerDeposit: Zero,
            partner: '0xaddr' as any,
            token: '0xtoken' as any,
            state: ChannelState.open,
            settleTimeout: 500,
            tokenNetwork: '0xtokennetwork' as any,
            closeBlock: undefined,
            openBlock: 12346,
            id: 1
          }))
        }
      }),
      mocks: {
        $router: router,
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $raiden: raiden,
        $identicon: {
          getIdenticon: jest.fn()
        },
        $t: (msg: string) => msg
      }
    };
    return mount(Payment, options);
  }

  beforeEach(() => {
    loading.mockReset();
    done.mockReset();
  });

  beforeAll(async () => {
    router = new VueRouter() as Mocked<VueRouter>;
    raiden = new RaidenService(store) as Mocked<RaidenService>;
    const route = stub<Route>();

    raiden.getToken = jest.fn().mockResolvedValue(token);
    route.params = {
      token: '0xtoken'
    };

    router.currentRoute = route;

    wrapper = vueFactory(router, raiden);

    await flushPromises();
    loading = jest.spyOn(wrapper.vm.$data, 'loading', 'set');
    done = jest.spyOn(wrapper.vm.$data, 'done', 'set');
  });

  test('should populate the data properties on mount', async () => {
    expect(wrapper.vm.$data.token).toEqual(token);
  });

  test('should finish reset load and done after successful transfer', async () => {
    raiden.transfer = jest.fn().mockResolvedValue(null);

    const addressInput = wrapper.findAll('input').at(0);
    const amountInput = wrapper.findAll('input').at(1);

    mockInput(addressInput, '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA');
    mockInput(amountInput, '0.01');

    wrapper.setData({
      valid: true
    });

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');

    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(2);
    expect(done).toHaveBeenNthCalledWith(1, true);
    expect(done).toHaveBeenNthCalledWith(2, false);
  });

  test('should finish reset load and done after failed transfer', async () => {
    raiden.transfer = jest.fn().mockRejectedValue(new Error('failure'));

    const addressInput = wrapper.findAll('input').at(0);
    const amountInput = wrapper.findAll('input').at(1);

    mockInput(addressInput, '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA');
    mockInput(amountInput, '0.1');

    wrapper.setData({
      valid: true
    });

    const button = wrapper.find('.action-button__button');
    expect(button.attributes()['disabled']).toBeUndefined();
    button.trigger('click');

    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toEqual('failure');
  });

  test('should deposit successfully', async () => {
    raiden.deposit = jest.fn().mockResolvedValue(null);
    // @ts-ignore
    await wrapper.vm.deposit(One);
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(2);
    expect(done).toHaveBeenNthCalledWith(1, true);
    expect(done).toHaveBeenNthCalledWith(2, false);
  });

  test('should handle deposit failure', async () => {
    raiden.deposit = jest.fn().mockRejectedValue(new Error('failure'));
    // @ts-ignore
    await wrapper.vm.deposit(One);
    await flushPromises();
    jest.advanceTimersByTime(2000);

    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(0);
    expect(wrapper.vm.$data.error).toEqual('failure');
  });
});
