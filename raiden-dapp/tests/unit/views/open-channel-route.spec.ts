import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store';
import { $identicon } from '../utils/mocks';
import OpenChannelRoute from '@/views/OpenChannelRoute.vue';

Vue.use(Vuetify);

describe('OpenChannelRoute.vue', () => {
  let wrapper: Wrapper<OpenChannelRoute>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(OpenChannelRoute, {
      vuetify,
      store,
      stubs: ['home', 'open-channel'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });
  });

  test('disconnected displays home', async () => {
    expect(wrapper.find('home-stub').exists()).toBe(true);
  });

  test('connected displays actual route', async () => {
    store.commit('account', '0x0000000000000000000000000000000000020001');
    store.commit('loadComplete', true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('home-stub').exists()).toBe(false);
    expect(wrapper.find('open-channel-stub').exists()).toBe(true);
  });
});
