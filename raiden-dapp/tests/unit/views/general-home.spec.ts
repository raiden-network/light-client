import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store/index';
import { $identicon } from '../utils/mocks';
import GeneralHome from '@/views/GeneralHome.vue';

Vue.use(Vuetify);

describe('GeneralHome.vue', () => {
  let wrapper: Wrapper<GeneralHome>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(GeneralHome, {
      vuetify,
      store,
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });
  });

  test('renders identicon', () => {
    expect(wrapper.vm.$identicon.getIdenticon).toHaveBeenCalled();
  });
});
