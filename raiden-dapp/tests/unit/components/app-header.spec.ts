import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store';
import { $identicon } from '../utils/mocks';
import AppHeader from '@/components/AppHeader.vue';
import { RouteNames } from '@/router/route-names';
import { TestData } from '../data/mock-data';

Vue.use(Vuetify);

describe('AppHeader.vue', () => {
  let wrapper: Wrapper<AppHeader>;
  let vuetify: typeof Vuetify;

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
    store.commit('account', '0x0000000000000000000000000000000000020001');
    store.commit('loadComplete', true);
    wrapper = createWrapper(RouteNames.CHANNELS);
    expect((wrapper.vm as any).canGoBack).toBe(true);
  });

  test('new notifications displays notification badge', async () => {
    wrapper = createWrapper(RouteNames.CHANNELS);
    let newNotificationsBadge = wrapper.find('.v-badge__badge');

    expect(newNotificationsBadge.exists()).toBe(false);

    await store.dispatch('notifications/notify', TestData.notifications);

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
});
