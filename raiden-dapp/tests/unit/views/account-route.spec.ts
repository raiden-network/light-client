/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import { RouteNames } from '@/router/route-names';
import AccountRoute from '@/views/AccountRoute.vue';

jest.mock('vue-router');
import Mocked = jest.Mocked;

Vue.use(Vuex);
Vue.use(Vuetify);

const router = new VueRouter() as Mocked<VueRouter>;
const vuetify = new Vuetify();

const createWrapper = (): Wrapper<AccountRoute> => {
  const getters = {
    network: () => 'Selected Network',
    isConnected: () => true,
  };
  const store = new Vuex.Store({ getters });

  return mount(AccountRoute, {
    vuetify,
    stubs: ['router-view'],
    store,
    mocks: {
      $t: (msg: string) => msg,
      $router: router,
      $route: {
        name: RouteNames.ACCOUNT_ROOT,
        meta: {
          title: 'title',
        },
      },
    },
  });
};

describe('AccountRoute.vue', () => {
  test('clicking on back button calls navigateBack method', async () => {
    const wrapper = createWrapper();
    (wrapper.vm as any).navigateBack = jest.fn();

    const backButton = wrapper.findAll('button').at(0);
    backButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).navigateBack).toHaveBeenCalledTimes(1);
  });

  test('clicking on back button navigates to previously visited route', () => {
    const wrapper = createWrapper();

    const backButton = wrapper.findAll('button').at(0);
    backButton.trigger('click');

    expect(router.go).toHaveBeenCalledTimes(1);
    expect(router.go).toHaveBeenCalledWith(-1);
  });
});
