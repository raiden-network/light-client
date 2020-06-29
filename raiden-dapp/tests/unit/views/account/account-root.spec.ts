import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';
import { $identicon } from '../../utils/mocks';
import AccountRoot from '@/views/account/AccountRoot.vue';

Vue.use(Vuetify);

describe('AccountRoot.vue', () => {
  let wrapper: Wrapper<AccountRoot>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(AccountRoot, {
      vuetify,
      store,
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    });
  });

  test('renders identicon', () => {
    expect(wrapper.vm.$identicon.getIdenticon).toHaveBeenCalled();
  });
});
