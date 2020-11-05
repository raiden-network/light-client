jest.mock('vue-router');

import flushPromises from 'flush-promises';
import { mount, shallowMount, Wrapper } from '@vue/test-utils';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import Vue from 'vue';
import VueRouter from 'vue-router';
import { TestData } from '../data/mock-data';
import { $identicon } from '../utils/mocks';
import ChannelsRoute from '@/views/ChannelsRoute.vue';
import Filters from '@/filters';
import store from '@/store';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';

jest.mock('@/i18n', () => jest.fn());

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('displayFormat', Filters.displayFormat);

describe('ChannelsRoute.vue', () => {
  let $raiden: Mocked<RaidenService>;
  let $router: Mocked<VueRouter>;
  let wrapper: Wrapper<ChannelsRoute>;
  let vuetify: Vuetify;

  store.commit('updateChannels', TestData.mockChannels);
  store.commit('updateTokens', TestData.mockTokens);

  function createWrapper(token = '0xd0A1E359811322d97991E03f863a0C30C2cF029C', shallow = false) {
    vuetify = new Vuetify();

    const options = {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $router,
        $route: TestData.mockRoute({
          token,
        }),
        $raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    };

    if (shallow) {
      return shallowMount(ChannelsRoute, options);
    }
    return mount(ChannelsRoute, options);
  }

  beforeEach(() => {
    $router = new VueRouter() as Mocked<VueRouter>;
    $router.push = jest.fn().mockResolvedValue(undefined);

    $raiden = new RaidenService(store) as Mocked<RaidenService>;
    $raiden.fetchTokenData = jest.fn().mockResolvedValue(undefined);
    $raiden.connect = jest.fn().mockResolvedValue(undefined);

    vuetify = new Vuetify();
  });

  afterEach(() => {
    $router.push.mockReset();
  });

  test('render the test data', () => {
    wrapper = createWrapper();
    expect(wrapper.findAll('.channel-list__channels__channel').length).toEqual(2);
  });

  test('navigate to home when the address is not in checksum format', async () => {
    wrapper = createWrapper('0xd0a1e359811322d97991e03f863a0c30c2cf029c', true);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME,
      }),
    );
  });

  test('navigate to home when the token cannot be found', async () => {
    wrapper = createWrapper('0x111157460c0F41EfD9107239B7864c062aA8B978', true);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME,
      }),
    );
  });

  test('clicking on deposit changes action', async () => {
    wrapper = createWrapper();
    wrapper.find('#deposit-278').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data['action']).toBe('deposit');
  });
});
