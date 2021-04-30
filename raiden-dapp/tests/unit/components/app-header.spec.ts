/* eslint-disable @typescript-eslint/no-explicit-any */
import { $identicon } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import AppHeader from '@/components/AppHeader.vue';
import { RouteNames } from '@/router/route-names';

jest.mock('vue-router');
import Mocked = jest.Mocked;

Vue.use(Vuex);
Vue.use(Vuetify);

const router = new VueRouter() as Mocked<VueRouter>;
const vuetify = new Vuetify();
const network = 'Selected Network';

const createWrapper = (
  isConnected = true,
  newNotifications = false,
  routeName = RouteNames.CHANNELS,
): Wrapper<AppHeader> => {
  const state = {
    isConnected,
  };
  const getters = {
    network: () => network,
  };
  const notificationsModule = {
    namespaced: true,
    state: {
      newNotifications,
    },
    mutations: {
      notificationsViewed: () => true,
    },
  };

  const store = new Vuex.Store({
    state,
    getters,
    modules: { notifications: notificationsModule },
  });

  return mount(AppHeader, {
    vuetify,
    store,
    mocks: {
      $identicon: $identicon(),
      $router: router,
      $route: {
        name: routeName,
        meta: {
          title: 'title',
        },
        params: {
          token: '0xtoken',
        },
      },
    },
  });
};

beforeEach(() => {
  router.push = jest.fn();
});

describe('AppHeader.vue', () => {
  test('clicking back button routes back to previous screen', async () => {
    const wrapper = createWrapper();
    const backButton = wrapper.findAll('button').at(0);

    backButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER,
        params: {
          token: '0xtoken',
        },
      }),
    );
  });

  test('no new notifications does not display notification badge', () => {
    const wrapper = createWrapper();
    const newNotificationsBadge = wrapper.find('.v-badge');

    expect(newNotificationsBadge.exists()).toBe(false);
  });

  test('new notifications displays notification badge', () => {
    const wrapper = createWrapper(true, true);
    const newNotificationsBadge = wrapper.find('.v-badge');

    expect(newNotificationsBadge.exists()).toBe(true);
  });

  test('clicking notifications icon calls notificationPanel method', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).notificationPanel = jest.fn();

    const notificationsIcon = wrapper.find('.app-header__content__icons__notifications-button');
    notificationsIcon.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).notificationPanel).toHaveBeenCalledTimes(1);
  });

  test('clicking notifications icon routes to notifications screen', async () => {
    const wrapper = createWrapper();
    const backButton = wrapper.find('.app-header__content__icons__notifications-button');

    backButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.NOTIFICATIONS,
      }),
    );
  });

  test('clicking identicon calls accountMenu method', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).accountMenu = jest.fn();

    const identicon = wrapper.find('.app-header__content__icons__identicon');
    identicon.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).accountMenu).toHaveBeenCalledTimes(1);
  });

  test('clicking identicon routes to account screen', async () => {
    const wrapper = createWrapper();
    const backButton = wrapper.find('.app-header__content__icons__identicon');

    backButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.ACCOUNT_ROOT,
      }),
    );
  });

  test('does not display identicon if on disclaimer route', () => {
    const wrapper = createWrapper(true, false, RouteNames.DISCLAIMER);
    const identicon = wrapper.find('.app-header__content__icons__identicon');

    expect(identicon.exists()).toBe(false);
  });

  test('does not display network if on disclaimer route', () => {
    const wrapper = createWrapper(true, false, RouteNames.DISCLAIMER);
    const networkName = wrapper.find('.header-content__title__network');

    expect(networkName.exists()).toBe(false);
  });

  test('does not display network if not connected', () => {
    const wrapper = createWrapper(false, false);
    const networkName = wrapper.find('.header-content__title__network');

    expect(networkName.exists()).toBe(false);
  });
});
