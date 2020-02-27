import { mount, Wrapper } from '@vue/test-utils';
import Vuetify from 'vuetify';
import Vue from 'vue';

import TokenInformation from '@/components/TokenInformation.vue';
import { TestData } from '../data/mock-data';
import Filters from '@/filters';

Vue.use(Vuetify);
Vue.filter('truncate', Filters.truncate);
Vue.filter('displayFormat', Filters.displayFormat);

describe('TokenInformation.vue', () => {
  let wrapper: Wrapper<TokenInformation>;
  let vuetify: typeof Vuetify;

  beforeAll(() => {
    vuetify = new Vuetify();
    wrapper = mount(TokenInformation, {
      vuetify,
      stubs: ['v-dialog'],
      propsData: {
        token: TestData.token
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('displays token balance', () => {
    const balance = wrapper.find('.token-information__balance');
    expect(balance.text()).toContain('1.2');
  });

  test('shows minting dialog if mint button is clicked', () => {
    wrapper.find('button').trigger('click');
    expect(wrapper.vm.$data.showMintDialog).toBeTruthy();
  });
});
