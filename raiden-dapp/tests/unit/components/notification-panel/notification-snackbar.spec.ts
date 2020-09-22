import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import NotificationSnackbar from '@/components/notification-panel/NotificationSnackbar.vue';
import { TestData } from '../../data/mock-data';

Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

describe('NotificationSnackbar.vue', () => {
  let wrapper: Wrapper<NotificationSnackbar>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(NotificationSnackbar, {
      vuetify,
      store,
      mocks: {
        $t: (msg: string) => msg,
      },
    });
    store.commit('notifications/clear');
  });

  test('displays notifications', async () => {
    expect.assertions(1);
    await store.commit(
      'notifications/notificationAddOrReplace',
      TestData.notifications
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.notification-area__title').text()).toMatch(
      'Channel Settlement'
    );
  });

  test('dismisses notification on button click', async () => {
    expect.assertions(1);
    const notificationId = TestData.notifications.id;

    await store.commit(
      'notifications/notificationAddOrReplace',
      TestData.notifications
    );
    await wrapper.vm.$nextTick();
    wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    expect(
      // @ts-ignore
      store.state.notifications.notifications[notificationId].display
    ).toBeFalsy();
  });
});
