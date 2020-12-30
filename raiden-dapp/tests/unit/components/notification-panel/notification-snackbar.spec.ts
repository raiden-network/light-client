jest.mock('vue-router');
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import { TestData } from '../../data/mock-data';
import Filters from '@/filters';
import NotificationSnackbar from '@/components/notification-panel/NotificationSnackbar.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

const $router = new VueRouter() as jest.Mocked<VueRouter>;
const setNotificationShown = jest.fn();
const mutations = { setNotificationShown };

async function createWrapper(
  notificationQueue = [TestData.notifications],
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

  test('shows notification if the queue is not empty and notification should be shown', async () => {
    const wrapper = await createWrapper();
    const snackbar = wrapper.find('.notification-snackbar');
    const title = wrapper.get('.notification-snackbar__area__title');

    expect(snackbar.exists()).toBe(true);
    expect(title.text()).toBe('Channel Settlement');
  });

  test('dismisses notification on button click', async () => {
    const wrapper = await createWrapper();
    const button = wrapper.get('button');

    button.trigger('click');
    await wrapper.vm.$nextTick();
    const snackbar = wrapper.find('.notification-snackbar');

    expect(snackbar.exists()).toBe(false);
    expect(setNotificationShown).toHaveBeenCalledTimes(1);
    expect(setNotificationShown).toHaveBeenNthCalledWith(1, {}, TestData.notifications.id);
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

  test('dismisses notification on content click', async () => {
    const wrapper = await createWrapper();
    const content = wrapper.get('.notification-snackbar__area');

    content.trigger('click');
    await wrapper.vm.$nextTick();
    const snackbar = wrapper.find('.notification-snackbar');

    expect(snackbar.exists()).toBe(false);
    expect(setNotificationShown).toHaveBeenCalledTimes(1);
    expect(setNotificationShown).toHaveBeenNthCalledWith(1, {}, TestData.notifications.id);
  });
});
