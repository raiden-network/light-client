import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';

import { addElemWithDataAppToBody } from '../utils/dialog';
import { TestData } from '../data/mock-data';
import TokenOverlay from '@/components/TokenOverlay.vue';
import { $identicon } from '../utils/mocks';

describe('TokenOverlay.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<TokenOverlay>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    const localVue = createLocalVue();
    vuetify = new Vuetify();
    localVue.use(Vuex);
    localVue.use(Vuetify);
    wrapper = mount(TokenOverlay, {
      localVue,
      vuetify,
      store: new Store({
        getters: {
          allTokens: jest.fn().mockReturnValue([TestData.token]),
          token: jest.fn().mockReturnValue([TestData.token])
        },
        state: {
          tokens: { [TestData.token.address]: TestData.token }
        }
      }),
      mocks: {
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $identicon: $identicon(),
        $t: (msg: string) => msg
      },
      propsData: {
        show: true
      }
    });
  });

  test('renders', () => {
    expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
  });

  test('should hide if close button is clicked', () => {
    wrapper.find('.token-network-overlay__close-button').trigger('click');
    expect(wrapper.find('.v-overlay--active').exists()).toBe(false);
  });

  test('should display connect new token list item', () => {
    const connectNewToken = wrapper.find('#connect-new v-list-item');
    expect(connectNewToken.exists()).toBe(true);
  });
});
