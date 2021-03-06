import { $identicon } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import store from '@/store';
import WithdrawalRoute from '@/views/account/WithdrawalRoute.vue';

Vue.use(Vuetify);

describe('WithdrawalRoute.vue', () => {
  let wrapper: Wrapper<WithdrawalRoute>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();

    wrapper = shallowMount(WithdrawalRoute, {
      vuetify,
      store,
      stubs: ['withdrawal'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    });
  });

  test('component renders', () => {
    expect(wrapper.find('withdrawal-stub')).toBeDefined();
  });
});
