/* eslint-disable @typescript-eslint/no-explicit-any */
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import { $identicon } from '../utils/mocks';
import { connectAccount } from '../utils/store-utils';
import { TestData } from '../data/mock-data';
import store from '@/store';
import AppHeader from '@/components/AppHeader.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuetify);

describe('AppHeader.vue', () => {
  let wrapper: Wrapper<AppHeader>;
  let vuetify: Vuetify;

  function createWrapper(name: string) {
    vuetify = new Vuetify();
    return mount(AppHeader, {
      vuetify,
      store,
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
        $route: {
          name,
          meta: {
            title: 'title',
          },
        },
      },
    });
  }

  test('you cannot go back if not connected', () => {
    wrapper = createWrapper(RouteNames.CHANNELS);
    expect((wrapper.vm as any).canGoBack).toBe(false);
  });

  test('you can go back if connected', () => {
    connectAccount();
    wrapper = createWrapper(RouteNames.CHANNELS);
    expect((wrapper.vm as any).canGoBack).toBe(true);
  });

  test('new notifications displays notification badge', async () => {
    wrapper = createWrapper(RouteNames.CHANNELS);
    let newNotificationsBadge = wrapper.find('.v-badge__badge');

    expect(newNotificationsBadge.exists()).toBe(false);

    store.commit('notifications/notificationAddOrReplace', TestData.notifications);

    await wrapper.vm.$nextTick();
    newNotificationsBadge = wrapper.find('.v-badge__badge');

    expect(newNotificationsBadge.exists()).toBe(true);
  });

  test('clicking notification icon calls navigates to notifications', async () => {
    wrapper = createWrapper(RouteNames.CHANNELS);
    (wrapper.vm as any).navigateToNotifications = jest.fn();
    const notificationsButton = wrapper.findAll('button').at(1);

    notificationsButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).navigateToNotifications).toHaveBeenCalled();
  });

  test('show title only if on disclaimer route', () => {
    connectAccount();
    wrapper = createWrapper(RouteNames.DISCLAIMER);
    const title = wrapper.find('.app-header__title__route');
    const networkLabel = wrapper.find('.app-header__top__content__network');
    const notificationsBadge = wrapper.find('.app-header__notifications-wrapper');
    const identicon = wrapper.find('.app-header__icons__identicon');

    expect((wrapper.vm as any).canGoBack).toBe(false);
    expect(title.exists()).toBe(true);
    expect(networkLabel.exists()).toBe(false);
    expect(notificationsBadge.exists()).toBe(false);
    expect(identicon.exists()).toBe(false);
  });
});
