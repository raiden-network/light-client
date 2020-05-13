import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';
import store from '@/store';
import { $identicon } from '../../utils/mocks';
import WithdrawalRoute from '@/views/account/WithdrawalRoute.vue';

Vue.use(Vuetify);

describe('WithdrawalRoute.vue', () => {
  let wrapper: Wrapper<WithdrawalRoute>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = mount(WithdrawalRoute, {
      vuetify,
      store,
      stubs: ['withdrawal'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });
  });

  test('component renders', () => {
    expect(wrapper.is(WithdrawalRoute)).toBe(true);
  });
});
