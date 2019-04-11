import { stub } from '../utils/stub';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils';
import SendTokens from '@/views/SelectTarget.vue';
import VueRouter, { Route } from 'vue-router';

jest.mock('vue-router');

import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('SelectTarget.vue', function() {
  let wrapper: Wrapper<SendTokens>;
  let router: Mocked<VueRouter>;

  function vueFactory(router: VueRouter, data: {} = {}): Wrapper<SendTokens> {
    const localVue = createLocalVue();
    return shallowMount(SendTokens, {
      localVue,
      mocks: {
        $router: router
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

  it('should populate the data properties on mount', async function() {
    const route = stub<Route>();
    route.params = {
      token: '0xtoken'
    };
    router.currentRoute = route;
    wrapper = vueFactory(router);
    await flushPromises();
    expect(wrapper.vm.$data.token).toEqual('0xtoken');
  });
});
