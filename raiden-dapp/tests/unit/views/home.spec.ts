import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import { DeniedReason } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import type { Configuration } from '@/services/config-provider';
import { ConfigProvider } from '@/services/config-provider';
import RaidenService from '@/services/raiden-service';
import store from '@/store/index';
import type { EthereumProvider } from '@/types';
import Home from '@/views/Home.vue';

jest.mock('@/services/raiden-service');
jest.mock('@/services/config-provider');
jest.mock('@/i18n', () => jest.fn());
jest.mock('@/services/web3-provider', () => {
  class Web3Provider {
    static async provider(_configuration?: Configuration): Promise<EthereumProvider | undefined> {
      return 'https://some.rpc.provider';
    }
  }

  return { Web3Provider };
});

import Mocked = jest.Mocked;

Vue.use(Vuex);
Vue.use(Vuetify);

describe('Home.vue', () => {
  let wrapper: Wrapper<Home>;
  let vuetify: Vuetify;
  let router: Mocked<VueRouter>;
  let $raiden: RaidenService;

  beforeEach(() => {
    (ConfigProvider as jest.Mocked<typeof ConfigProvider>).configuration.mockResolvedValue({
      per_network: {},
    });
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    $raiden = new RaidenService(store, router);
    $raiden.connect = jest.fn();
    wrapper = mount(Home, {
      vuetify,
      store,
      stubs: ['i18n', 'v-dialog'],
      mocks: {
        $router: router,
        $route: { query: {} },
        $raiden: $raiden,
        $t: (msg: string) => msg,
      },
    });
  });

  async function connect(settings?: { useRaidenAccount?: boolean }): Promise<void> {
    store.commit('updateSettings', {
      useRaidenAccount: true,
      ...settings,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.vm as any).connect();
    await flushPromises();
  }

  test('connects with sub key by default', async () => {
    await connect();
    expect($raiden.connect).toHaveBeenCalledTimes(1);
  });

  test('successful connect navigates to transfer route per default', async () => {
    await connect();
    expect(router.push).toHaveBeenCalledWith({ name: RouteNames.TRANSFER });
  });

  test('successful connect navigates to redirect target if given in query', async () => {
    const redirectTo = 'connect/0x5Fc523e13fBAc2140F056AD7A96De2cC0C4Cc63A';
    wrapper.vm.$route.query = { redirectTo };

    await connect();

    expect(router.push).toHaveBeenCalledWith({ path: redirectTo });
  });

  test('connect can be called without displaying error after failing initially', async () => {
    store.commit('accessDenied', DeniedReason.NO_ACCOUNT);
    await connect();
    expect(store.state.accessDenied).toEqual(DeniedReason.UNDEFINED);
  });

  test('displays welcome title', () => {
    const welcomeTitle = wrapper.find('.home__app-welcome');

    expect(welcomeTitle.text()).toBe('home.welcome');
  });

  test('displays disclaimer', () => {
    const disclaimer = wrapper.find('.home__disclaimer');

    expect(disclaimer.text()).toBe('home.disclaimer');
  });

  test('displays getting started link', () => {
    const gettingStartedText = wrapper.find('.home__getting-started');

    expect(gettingStartedText.text()).toContain('home.getting-started.link-name');
  });
});
