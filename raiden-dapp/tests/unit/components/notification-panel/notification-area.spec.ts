import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import NotificationArea from '@/components/notification-panel/NotificationArea.vue';
import { TestData } from '../../data/mock-data';
import { NotificationContext } from '@/store/notifications/notification-context';

Vue.use(Vuetify);
Vue.filter('formatDate', Filters.formatDate);

describe('NotificationArea.vue', () => {
  let wrapper: Wrapper<NotificationArea>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(NotificationArea, {
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
    await store.dispatch('notifications/notify', TestData.notifications);
    await wrapper.vm.$nextTick();
    expect(
      wrapper
        .find('.notification-area__notification__content__description')
        .text()
    ).toMatch('The monitoring service has submitted a balance proof.');
  });

  test('dismisses notification on button click', async () => {
    expect.assertions(1);
    await store.dispatch('notifications/notify', TestData.notifications);
    await wrapper.vm.$nextTick();
    wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();
    // @ts-ignore
    expect(store.state.notifications.notifications[0].display).toBeFalsy();
  });

  test('shows number of pending notifications', async () => {
    expect.assertions(3);
    await store.dispatch('notifications/notify', TestData.notifications);
    await store.dispatch('notifications/notify', {
      ...TestData.notifications,
      duration: undefined,
      context: undefined,
    });
    await store.dispatch('notifications/notify', TestData.notifications);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.v-badge__badge').text()).toBe('3');
    // @ts-ignore
    const notifications = store.state.notifications.notifications;
    expect(notifications[1].duration).toBe(5000);
    expect(notifications[1].context).toBe(NotificationContext.NONE);
  });
});
