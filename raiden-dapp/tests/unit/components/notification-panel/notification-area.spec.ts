import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import NotificationArea from '@/components/notification-panel/NotificationArea.vue';
import { TestData } from '../../data/mock-data';

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
    expect(wrapper.find('.notification-area__title').text()).toMatch(
      'Channel Settlement'
    );
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
});
