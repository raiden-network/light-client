/* eslint-disable @typescript-eslint/no-explicit-any */
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import AccountRoute from '@/views/AccountRoute.vue';
import { RouteNames } from '@/router/route-names';

Vue.use(Vuex);
Vue.use(Vuetify);

const createWrapper = (): Wrapper<AccountRoute> => {
  const vuetify = new Vuetify();
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
});
