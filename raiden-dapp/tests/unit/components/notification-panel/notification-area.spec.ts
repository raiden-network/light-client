import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import { TestData } from '../../data/mock-data';
import NotificationArea from '@/components/notification-panel/NotificationArea.vue';

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
      propsData: {
        notification: TestData.notifications,
      },
      mocks: {
        $t: (msg: string) => msg,
      },
    });
  });

  test('smoke test', async () => {
    console.log(wrapper.vm.$data.notification.id);
    console.log(wrapper.html());
  });
});
