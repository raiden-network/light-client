import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import store from '@/store/index';
import NotificationPanel from '@/views/NotificationPanel.vue';

jest.mock('vue-router');

import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);

describe('NotificationPanel.vue', () => {
  let wrapper: Wrapper<NotificationPanel>;
  let router: Mocked<VueRouter>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    wrapper = mount(NotificationPanel, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg,
      },
    });
  });

  test('displays text when no notifications are available', () => {
    const noNotificationsHeader = wrapper.find('.notification-panel-content__no-notifications');

    expect(noNotificationsHeader.text()).toBe('notifications.no-notifications');
  });

  test('go to previous screen when close button is clicked', () => {
    const notificationPanelCloseButton = wrapper.findAll('button').at(1);
    notificationPanelCloseButton.trigger('click');

    expect(router.go).toHaveBeenCalledTimes(1);
    expect(router.go).toHaveBeenCalledWith(-1);
  });
});
