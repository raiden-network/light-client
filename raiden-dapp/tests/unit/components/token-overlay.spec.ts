import { mount, Wrapper } from '@vue/test-utils';
import Vuex from 'vuex';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { TestData } from '../data/mock-data';
import TokenOverlay from '@/components/TokenOverlay.vue';
import { $identicon } from '../utils/mocks';
import store from '@/store/index';
import { Tokens } from '@/types';
import { RaidenChannel, RaidenChannels } from 'raiden-ts';

Vue.use(Vuetify);
Vue.use(Vuex);

describe('TokenOverlay.vue', () => {
  let wrapper: Wrapper<TokenOverlay>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(TokenOverlay, {
      vuetify,
      store,
      mocks: {
        $route: TestData.mockRoute({
          token: '0xtoken'
        }),
        $identicon: $identicon(),
        $t: (msg: string) => msg
      },
      stubs: ['router-link'],
      propsData: {
        show: true
      }
    });
  });

  test('render', () => {
    expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
  });

  afterEach(() => {
    store.commit('reset');
  });

  describe('with tokens loaded', () => {
    beforeEach(() => {
      store.commit('updateTokens', {
        [TestData.token.address]: TestData.token
      } as Tokens);
      store.commit('updateChannels', {
        [TestData.token.address]: {
          [TestData.openChannel.partner]: {
            ...TestData.openChannel,
            token: TestData.token.address
          } as RaidenChannel
        }
      } as RaidenChannels);
    });

    test('emit a cancel event when the user presses the close button', () => {
      wrapper.find('.token-network-overlay__close-button').trigger('click');
      expect(wrapper.emitted().cancel).toBeTruthy();
    });

    test('hide the overlay when the show property changes', () => {
      expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
      wrapper.setProps({ show: false });
      expect(wrapper.find('.v-overlay--active').exists()).toBe(false);
    });

    test('show the "connect new token list" item', () => {
      const connectNewToken = wrapper.find('#connect-new .v-list-item');
      expect(connectNewToken.exists()).toBe(true);
    });
  });

  describe('with token placeholder', () => {
    beforeEach(() => {
      store.commit('updateTokens', {
        [TestData.token.address]: { address: TestData.token.address }
      } as Tokens);
      store.commit('updateChannels', {
        [TestData.token.address]: {
          [TestData.openChannel.partner]: {
            ...TestData.openChannel,
            token: TestData.token.address
          } as RaidenChannel
        }
      } as RaidenChannels);
    });

    test('show the balances as zero', () => {
      expect(wrapper.find('.token-list__token-balance').text()).toMatch('0.0');
    });
  });
});
