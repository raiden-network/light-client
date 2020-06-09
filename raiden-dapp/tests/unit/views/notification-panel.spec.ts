jest.mock('vue-router');
import Mocked = jest.Mocked;
import Vue from 'vue';
import Vuex from 'vuex';
import store from '@/store/index';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import NotificationPanel from '@/views/NotificationPanel.vue';

Vue.use(Vuetify);
Vue.use(Vuex);

describe('NotificationPanel.vue', () => {
  let wrapper: Wrapper<NotificationPanel>;
  let router: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    wrapper = mount(NotificationPanel, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg
      }
    });
  });

  test('displays text when no notifications are available', () => {
    const noNotificationsHeader = wrapper.find(
      '.notification-panel-content__no-notifications'
    );

    expect(noNotificationsHeader.text()).toBe('notifications.no-notifications');
  });

  test('go to previous screen when close button is clicked', () => {
    const notificationPanelCloseButton = wrapper.find('button');
    notificationPanelCloseButton.trigger('click');

    expect(router.go).toHaveBeenCalledTimes(1);
    expect(router.go).toHaveBeenCalledWith(-1);
  });
});
