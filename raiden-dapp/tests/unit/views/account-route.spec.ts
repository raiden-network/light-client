jest.mock('vue-router');
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';

import { TestData } from '../data/mock-data';
import AccountRoute from '@/views/AccountRoute.vue';
import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('AccountRoute.vue', () => {
  let wrapper: Wrapper<AccountRoute>;
  let router: Mocked<VueRouter>;
  let vuetify: Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;

    wrapper = mount(AccountRoute, {
      vuetify,
      stubs: ['router-view'],
      mocks: {
        $router: router,
        $route: TestData.mockRoute(),
        $t: (msg: string) => msg,
      },
    });
  });

  test('go to previously visited route when back arrow is clicked', () => {
    const button = wrapper.find('button');
    button.trigger('click');

    expect(router.go).toHaveBeenCalledTimes(1);
    expect(router.go).toHaveBeenCalledWith(-1);
  });
});