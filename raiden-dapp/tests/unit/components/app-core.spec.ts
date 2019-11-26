jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import store from '@/store/index';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import AppCore from '@/components/AppCore.vue';
import NoTokens from '@/components/NoTokens.vue';
import { TestData } from '../data/mock-data';
import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { Tokens } from '@/types';

Vue.use(Vuex);
Vue.use(Vuetify);

describe('AppCore.vue', () => {
  let wrapper: Wrapper<AppCore>;
  let mockedRouter: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  const vueFactory = () =>
    mount(AppCore, {
      vuetify,
      store,
      mocks: {
        $router: mockedRouter,
        $t: (msg: string) => msg
      }
    });

  beforeEach(() => {
    mockedRouter = new VueRouter() as Mocked<VueRouter>;
    mockedRouter.push = jest.fn().mockResolvedValue(null);
    vuetify = new Vuetify();
  });

  describe('without connected tokens', () => {
    test('should display NoTokens component if user has no connected tokens', () => {
      wrapper = vueFactory();

      expect(wrapper.find(NoTokens).exists()).toBeTruthy();
      expect(mockedRouter.push).toHaveBeenCalledTimes(0);
    });
  });

  describe('with connected tokens', () => {
    test('should redirect to Transfer view if user has connected tokens', () => {
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
      vueFactory();

      expect(mockedRouter.push).toHaveBeenCalledTimes(1);
      expect(mockedRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RouteNames.TRANSFER
        })
      );
    });
  });
});
