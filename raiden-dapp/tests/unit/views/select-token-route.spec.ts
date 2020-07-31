import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store';
import { $identicon } from '../utils/mocks';
import SelectTokenRoute from '@/views/SelectTokenRoute.vue';
import { connectAccount } from '../utils/store-utils';

Vue.use(Vuetify);

describe('SelectTokenRoute.vue', () => {
  let wrapper: Wrapper<SelectTokenRoute>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(SelectTokenRoute, {
      vuetify,
      store,
      stubs: ['home', 'select-token'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    });
  });

  test('disconnected displays home', async () => {
    expect(wrapper.find('home-stub').exists()).toBe(true);
  });

  test('connected displays actual route', async () => {
    connectAccount();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('home-stub').exists()).toBe(false);
    expect(wrapper.find('select-token-stub').exists()).toBe(true);
  });
});
