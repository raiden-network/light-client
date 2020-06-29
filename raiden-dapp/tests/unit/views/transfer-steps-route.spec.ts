import Vue from 'vue';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store';
import { $identicon } from '../utils/mocks';
import TransferStepsRoute from '@/views/TransferStepsRoute.vue';

Vue.use(Vuetify);

describe('TransferStepsRoute.vue', () => {
  let wrapper: Wrapper<TransferStepsRoute>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(TransferStepsRoute, {
      vuetify,
      store,
      stubs: ['home', 'transfer-steps'],
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
    store.commit('account', '0x0000000000000000000000000000000000020001');
    store.commit('loadComplete', true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('home-stub').exists()).toBe(false);
    expect(wrapper.find('transfer-steps-stub').exists()).toBe(true);
  });
});
