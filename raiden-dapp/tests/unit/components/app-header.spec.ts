/* eslint-disable @typescript-eslint/no-explicit-any */
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import { $identicon } from '../utils/mocks';
import AppHeader from '@/components/AppHeader.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuex);
Vue.use(Vuetify);

const network = 'Selected Network';

const createWrapper = (
  connected = true,
  newNotifications = false,
  routeName = RouteNames.CHANNELS,
): Wrapper<AppHeader> => {
  const vuetify = new Vuetify();
  const getters = {
    isConnected: () => connected,
    network: () => network,
  };
  const notificationsModule = {
    namespaced: true,
    state: {
      newNotifications,
    },
  };

  const store = new Vuex.Store({ getters, modules: { notifications: notificationsModule } });

  return mount(AppHeader, {
    vuetify,
    store,
    mocks: {
      $identicon: $identicon(),
      $route: {
        name: routeName,
        meta: {
          title: 'title',
        },
      },
    },
  });
};

describe('AppHeader.vue', () => {
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

  test('clicking identicon calls accountMenu method', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).accountMenu = jest.fn();

    const identicon = wrapper.find('.app-header__content__icons__identicon');
    identicon.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).accountMenu).toHaveBeenCalledTimes(1);
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
