import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuex from 'vuex';

import { RouteNames } from '@/router/route-names';
import Home from '@/views/Home.vue';

Vue.use(Vuex);

const $router = new VueRouter() as jest.Mocked<VueRouter>;
$router.push = jest.fn();

function createWrapper(options?: { isConnected?: boolean; redirectTo?: string }): Wrapper<Home> {
  const state = { isConnected: options?.isConnected ?? false };
  const store = new Vuex.Store({ state });
  const $route = { query: { redirectTo: options?.redirectTo } };

  return shallowMount(Home, {
    store,
    mocks: {
      $router,
      $route,
      $t,
    },
  });
}

describe('Home.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays welcome title', () => {
    const wrapper = createWrapper();
    const welcomeTitle = wrapper.find('.home__app-welcome');

    expect(welcomeTitle.exists()).toBeTruthy();
    expect(welcomeTitle.text()).toBe('home.welcome');
  });

  test('displays disclaimer', () => {
    const wrapper = createWrapper();
    const disclaimer = wrapper.find('.home__disclaimer');

    expect(disclaimer.exists()).toBeTruthy();
    expect(disclaimer.text()).toBe('home.disclaimer');
  });

  test('displays getting started link', () => {
    const wrapper = createWrapper();
    const gettingStartedText = wrapper.find('.home__getting-started');

    expect(gettingStartedText.exists()).toBeTruthy();
    expect(gettingStartedText.text()).toContain('home.getting-started.link-name');
  });

  test('navigates automatically to transfer route when connection got established', async () => {
    createWrapper({ isConnected: true });

    expect($router.push).toHaveBeenCalledWith({ name: RouteNames.TRANSFER });
  });

  test('successful connect navigates to redirect target if given in query', async () => {
    createWrapper({
      isConnected: true,
      redirectTo: 'connect/0x5Fc523e13fBAc2140F056AD7A96De2cC0C4Cc63A',
    });

    expect($router.push).toHaveBeenCalledWith({
      path: 'connect/0x5Fc523e13fBAc2140F056AD7A96De2cC0C4Cc63A',
    });
  });
});
