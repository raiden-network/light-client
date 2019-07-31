import { mockInput } from '../utils/interaction-utils';

jest.mock('vue-router');
jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import { stub } from '../utils/stub';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Transfer from '@/views/Transfer.vue';
import store from '@/store';
import VueRouter, { Route } from 'vue-router';
import { TestData } from '../data/mock-data';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;
import { Zero } from 'ethers/constants';

Vue.use(Vuetify);

describe('Transfer.vue', () => {
  let wrapper: Wrapper<Transfer>;
  let router: Mocked<VueRouter>;
  let raiden: Mocked<RaidenService>;
  let loading: jest.SpyInstance;
  let done: jest.SpyInstance;

  const token = {
    address: '0xtoken',
    balance: Zero,
    decimals: 18,
    units: '0.0'
  };

  function vueFactory(
    router: VueRouter,
    raiden: RaidenService
  ): Wrapper<Transfer> {
    const localVue = createLocalVue();
    let options = {
      localVue,
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
    return mount(Transfer, options);
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
    mockInput(
      wrapper.findAll('input').at(0),
      '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA'
    );
    mockInput(wrapper.findAll('input').at(1), '1');
    wrapper.find('#transfer').trigger('click');
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
    raiden.transfer = jest.fn().mockRejectedValue(new Error('failed'));
    mockInput(
      wrapper.findAll('input').at(0),
      '0x32bBc8ba52FB6F61C24809FdeDA1baa5E55e55EA'
    );
    mockInput(wrapper.findAll('input').at(1), '1');
    wrapper.find('#transfer').trigger('click');
    await flushPromises();
    jest.advanceTimersByTime(2000);
    expect(loading).toHaveBeenCalledTimes(2);
    expect(loading).toHaveBeenNthCalledWith(1, true);
    expect(loading).toHaveBeenNthCalledWith(2, false);
    expect(done).toBeCalledTimes(1);
    expect(done).toHaveBeenNthCalledWith(1, false);
  });
});
