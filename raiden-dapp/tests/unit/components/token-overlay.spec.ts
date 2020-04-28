import { mount, Wrapper } from '@vue/test-utils';
import Vuex from 'vuex';
import Vue from 'vue';
import Vuetify from 'vuetify';

import { RouteNames } from '@/router/route-names';
import { TestData } from '../data/mock-data';
import TokenOverlay from '@/components/TokenOverlay.vue';
import { $identicon } from '../utils/mocks';
import store from '@/store/index';
import { Tokens } from '@/types';
import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import VueRouter from 'vue-router';
import Mocked = jest.Mocked;

Vue.use(Vuetify);
Vue.use(Vuex);

describe('TokenOverlay.vue', () => {
  let wrapper: Wrapper<TokenOverlay>;
  let vuetify: typeof Vuetify;
  let router: VueRouter;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockReturnValue(null);

    wrapper = mount(TokenOverlay, {
      vuetify,
      store,
      mocks: {
        $router: router,
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
      expect(wrapper.emitted('cancel')).toBeTruthy();
    });

    test('hide the overlay when the show property changes', async () => {
      expect(wrapper.find('.v-overlay--active').exists()).toBe(true);
      wrapper.setProps({ show: false });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.v-overlay--active').exists()).toBe(false);
    });

    test('show the "connect new token list" item', () => {
      const connectNewToken = wrapper.find('#connect-new .v-list-item');
      expect(connectNewToken.exists()).toBe(true);
    });

    test('emit a cancel event when token is selected', () => {
      wrapper.find('.v-list-item__content').trigger('click');
      expect(wrapper.emitted('cancel')).toBeTruthy();
    });

    test('should navigate to select token', async () => {
      wrapper.find('.v-list-item').trigger('click');
      expect(router.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.SELECT_TOKEN
        })
      );
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
  });
});
