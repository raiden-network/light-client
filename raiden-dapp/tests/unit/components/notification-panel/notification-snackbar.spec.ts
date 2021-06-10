import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import NotificationSnackbar from '@/components/notification-panel/NotificationSnackbar.vue';
import Filters from '@/filters';
import { RouteNames } from '@/router/route-names';
import type { NotificationPayload } from '@/store/notifications/types';

import { generateNotification } from '../../utils/data-generator';

jest.mock('vue-router');

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

const $router = new VueRouter() as jest.Mocked<VueRouter>;
const setNotificationShown = jest.fn();
const mutations = { setNotificationShown };
const notification = generateNotification();

async function createWrapper(
  notificationQueue: NotificationPayload[] = [notification],
): Promise<Wrapper<NotificationSnackbar>> {
  const vuetify = new Vuetify();
  const getters = {
    notificationQueue: () => notificationQueue,
  };

  const notificationsModule = {
    namespaced: true,
    getters,
    mutations,
  };

  const store = new Vuex.Store({ modules: { notifications: notificationsModule } });
  const wrapper = mount(NotificationSnackbar, {
    vuetify,
    store,
    mocks: {
      $router,
    },
  });
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('NotificationSnackbar.vue', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('does not show if there are no to display notifications', async () => {
    const wrapper = await createWrapper([]);
    const snackbar = wrapper.find('.notification-snackbar');

    expect(snackbar.exists()).toBe(false);
  });

  test('shows oldest notification from the queue', async () => {
    const oldNotification = generateNotification({ title: 'old' });
    const newNotification = generateNotification({ title: 'new' });
    const wrapper = await createWrapper([oldNotification, newNotification]);
    const snackbar = wrapper.find('.notification-snackbar');
    const title = wrapper.find('.notification-snackbar__area__title');

    expect(snackbar.isVisible()).toBeTruthy();
    expect(title.isVisible()).toBeTruthy();
    expect(title.text()).toBe('old');
  });

  test('dismisses notification on button click', async () => {
    const notification = generateNotification({ id: 5 });
    const wrapper = await createWrapper([notification]);
    const button = wrapper.get('button');

    button.trigger('click');
    await wrapper.vm.$nextTick();

    expect(setNotificationShown).toHaveBeenCalledTimes(1);
    expect(setNotificationShown).toHaveBeenLastCalledWith({}, 5);
  });

  test('dismisses notification on content click', async () => {
    const notification = generateNotification({ id: 5 });
    const wrapper = await createWrapper([notification]);
    const content = wrapper.get('.notification-snackbar__area');

    content.trigger('click');
    await wrapper.vm.$nextTick();

    expect(setNotificationShown).toHaveBeenCalledTimes(1);
    expect(setNotificationShown).toHaveBeenLastCalledWith({}, 5);
  });

  test('navigate to notification panel on content click', async () => {
    const wrapper = await createWrapper();
    const content = wrapper.get('.notification-snackbar__area');

    content.trigger('click');

    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.NOTIFICATIONS,
      }),
    );
  });
});
