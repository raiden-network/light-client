jest.mock('@/services/raiden-service');
jest.mock('vue-router');

import flushPromises from 'flush-promises';
import RaidenService from '@/services/raiden-service';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils';
import Connect from '@/views/Connect.vue';
import VueRouter, { Route } from 'vue-router';
import store from '@/store';
import { stub } from '../utils/stub';
import { TestData } from '../data/mock-data';

import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('Connect.vue', function() {
  let wrapper: Wrapper<Connect>;
  let router: Mocked<VueRouter>;
  let service: Mocked<RaidenService>;

  function vueFactory(
    router: VueRouter,
    service: RaidenService
  ): Wrapper<Connect> {
    const localVue = createLocalVue();
    return shallowMount(Connect, {
      localVue,
      mocks: {
        $router: router,
        $raiden: service
      }
    });
  }

  beforeEach(() => {
    router = new VueRouter() as Mocked<VueRouter>;
    service = new RaidenService(store) as Mocked<RaidenService>;
    service.getToken = jest.fn().mockResolvedValue(TestData.token);
    service.monitorToken = jest.fn().mockResolvedValue(null);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should load token and start monitoring', async function() {
    const route = stub<Route>();
    route.params = {
      token: '0xtoken',
      partner: '0xpartner'
    };
    router.currentRoute = route;
    wrapper = vueFactory(router, service);
    wrapper.vm.$data.token = '0xtoken';
    await flushPromises();
    expect(service.monitorToken).toHaveBeenCalledTimes(1);
    expect(service.monitorToken).toHaveBeenCalledWith('0xtoken');
  });

  it('should redirect to pre filled connect', async function() {
    const route = stub<Route>();
    route.params = {
      token: '',
      partner: ''
    };
    router.currentRoute = route;
    wrapper = vueFactory(router, service);
    await flushPromises();
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
