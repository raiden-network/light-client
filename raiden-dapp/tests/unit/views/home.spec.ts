jest.mock('vue-router');

import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import store from '@/store/index';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuetify from 'vuetify';
import Home from '@/views/Home.vue';
import NoTokens from '@/components/NoTokens.vue';
import { TestData } from '../data/mock-data';
import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { Tokens } from '@/types';

Vue.use(Vuex);
Vue.use(Vuetify);

describe('Home.vue', () => {
  let wrapper: Wrapper<Home>;
  let mockedRouter: Mocked<VueRouter>;
  let vuetify: typeof Vuetify;

  const vueFactory = () =>
    mount(Home, {
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
    store.commit('reset');
  });

  test('show the "NoTokens" component when the user has no connected tokens', () => {
    wrapper = vueFactory();

    expect(wrapper.find(NoTokens).exists()).toBeTruthy();
    expect(mockedRouter.push).toHaveBeenCalledTimes(0);
  });

  test('redirect to the "Transfer" view when the user has connected tokens', async () => {
    vueFactory();

    expect(wrapper.find(NoTokens).exists()).toBeTruthy();
    expect(mockedRouter.push).toHaveBeenCalledTimes(0);

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

    await wrapper.vm.$nextTick();

    expect(mockedRouter.push).toHaveBeenCalledTimes(1);
    expect(mockedRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER
      })
    );
  });
});
