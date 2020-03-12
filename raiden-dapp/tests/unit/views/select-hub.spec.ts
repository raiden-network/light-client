jest.useFakeTimers();

import Filters from '@/filters';
import { mount, shallowMount, Wrapper } from '@vue/test-utils';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import SelectHub from '@/views/SelectHub.vue';
import VueRouter, { Route } from 'vue-router';
import { mockInput } from '../utils/interaction-utils';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';
import Vue from 'vue';
import store from '@/store/index';
import { $identicon } from '../utils/mocks';
import flushPromises from 'flush-promises';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('truncate', Filters.truncate);

describe('SelectHub.vue', () => {
  let wrapper: Wrapper<SelectHub>;
  let router: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  const testToken = (address: string) =>
    Object.assign(TestData.token, {
      address: address
    });

  function createWrapper(route: Route, token: any, shallow: boolean = false) {
    vuetify = new Vuetify();
    const options = {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $route: route,
        $router: router,
        $identicon: $identicon(),
        $raiden: {
          fetchTokenData: jest.fn().mockResolvedValue(null),
          getAvailability: jest.fn().mockResolvedValue(true)
        },
        $t: (msg: string) => msg
      }
    };
    if (shallow) {
      return shallowMount(SelectHub, options);
    }
    return mount(SelectHub, options);
  }

  beforeEach(() => {
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    store.commit('reset');
    store.commit('updatePresence', {
      ['0x1D36124C90f53d491b6832F1c073F43E2550E35b']: true
    });
  });

  beforeAll(() => {
    process.env = { VUE_APP_HUB: 'hub.raiden.network' };
  });

  test('navigate to "OpenChannel when the user selects a hub', async () => {
    const tokenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
    const route = TestData.mockRoute({
      token: tokenAddress
    });
    const token = testToken(tokenAddress);
    store.commit('updateTokens', { [tokenAddress]: token });
    wrapper = createWrapper(route, token);
    mockInput(wrapper, '0x1D36124C90f53d491b6832F1c073F43E2550E35b');
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    await flushPromises();
    wrapper.find('.action-button__button').trigger('click');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: RouteNames.OPEN_CHANNEL })
    );
  });

  test('navigate to "Home" when the token address is not in checksum format', async () => {
    const route = TestData.mockRoute({
      token: '0xtoken'
    });
    wrapper = createWrapper(route, undefined, true);
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME
      })
    );
  });

  test('navigate to "Home" when the token cannot be found', async () => {
    const route = TestData.mockRoute({
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab'
    });

    wrapper = createWrapper(route, null, true);

    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME
      })
    );
  });

  test('auto suggest our hub on goerli if not connected yet', async () => {
    const tokenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
    const route = TestData.mockRoute({
      token: tokenAddress
    });
    const token = testToken(tokenAddress);
    store.commit('updateTokens', { [tokenAddress]: token });
    store.commit('network', { name: 'goerli' });
    wrapper = createWrapper(route, token);

    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.vm.$data.partner).toBe('hub.raiden.network');
  });
});
