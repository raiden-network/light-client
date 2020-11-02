import { ConfigProvider } from '@/services/config-provider';

jest.mock('@/services/raiden-service');
jest.mock('@/services/config-provider');
jest.mock('@/i18n', () => jest.fn());

import flushPromises from 'flush-promises';
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import store from '@/store/index';
import RaidenService from '@/services/raiden-service';
import { DeniedReason } from '@/model/types';
import Home from '@/views/Home.vue';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';

Vue.use(Vuex);
Vue.use(Vuetify);

describe('Home.vue', () => {
  let wrapper: Wrapper<Home>;
  let vuetify: Vuetify;
  let router: Mocked<VueRouter>;
  let $raiden: RaidenService;

  beforeEach(() => {
    (ConfigProvider as any).configuration.mockResolvedValue({});
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    $raiden = new RaidenService(store);
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

  async function connect(settings?: {
    useRaidenAccount?: boolean;
    isFirstTimeConnect?: boolean;
  }): Promise<void> {
    store.commit('updateSettings', {
      useRaidenAccount: true,
      isFirstTimeConnect: false,
      ...settings,
    });

    // @ts-ignore
    await wrapper.vm.connect();
    await flushPromises();
  }

  test('shows connect dialog if there is no sub key setting yet', async () => {
    await connect({ isFirstTimeConnect: true });
    expect(wrapper.vm.$data.connectDialog).toBe(true);
  });

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

  test('connect button displays connect dialog', async () => {
    store.commit('updateSettings', {
      useRaidenAccount: true,
      isFirstTimeConnect: true,
    });
    expect(wrapper.vm.$data.connectDialog).toBe(false);

    const connectButton = wrapper.find('button');
    connectButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.connectDialog).toBe(true);

    const connectDialog = wrapper.find('.connect');

    expect(connectDialog.exists()).toBe(true);
  });
});
