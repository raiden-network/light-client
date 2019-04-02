import flushPromises from 'flush-promises';
import RaidenService from '@/services/raiden-service';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils';
import Home from '@/views/Home.vue';
import VueRouter from 'vue-router';
import { RootState } from '@/types';

jest.mock('@/services/raiden-service');
jest.mock('vue-router');

import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('Home.vue', function() {
  let wrapper: Wrapper<Home>;
  let router: Mocked<VueRouter>;
  let service: Mocked<RaidenService>;

  function vueFactory(
    router: VueRouter,
    service: RaidenService,
    data: {} = {}
  ): Wrapper<Home> {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    return shallowMount(Home, {
      localVue,
      store: new Store<RootState>({
        state: {
          loading: true,
          defaultAccount: '',
          accountBalance: '0.0',
          providerDetected: true,
          userDenied: false,
          channels: {}
        }
      }),
      mocks: {
        $router: router,
        $raiden: service
      },
      propsData: data
    });
  }

  beforeEach(() => {
    router = new VueRouter() as Mocked<VueRouter>;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should redirect to connect if everything is ok', async function() {
    wrapper = vueFactory(router, service);
    await flushPromises();
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
