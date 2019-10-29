import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';

import { addElemWithDataAppToBody } from '../utils/dialog';
import { TestData } from '../data/mock-data';
import TokenOverlay from '@/components/TokenOverlay.vue';
import { $identicon } from '../utils/mocks';

describe('TokenOverlay.vue', () => {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<TokenOverlay>;
  let navigateToTokenSelect: jest.Mock<any, any>;

  beforeEach(() => {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    localVue.use(Vuetify);
    navigateToTokenSelect = jest.fn().mockResolvedValue(null);
    wrapper = mount(TokenOverlay, {
      localVue,
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
    wrapper.find('.close-button').trigger('click');
    expect(wrapper.find('.v-overlay--active').exists()).toBe(false);
  });

  test('should display connect new token list item', () => {
    const connectNewToken = wrapper.find('#connectNew v-list-item');
    expect(connectNewToken.exists()).toBe(true);
  });
});
