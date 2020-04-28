jest.mock('vue-router');

import flushPromises from 'flush-promises';
import { mount, shallowMount, Wrapper } from '@vue/test-utils';
import Channels from '@/components/navigation/Channels.vue';
import Vuex from 'vuex';
import { TestData } from '../../data/mock-data';
import Vuetify from 'vuetify';
import Filters from '@/filters';
import Vue from 'vue';
import store from '@/store';
import { $identicon } from '../../utils/mocks';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;
import { RouteNames } from '@/router/route-names';
import VueRouter from 'vue-router';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('displayFormat', Filters.displayFormat);

describe('Channels.vue', () => {
  let $raiden: Mocked<RaidenService>;
  let $router: Mocked<VueRouter>;
  let wrapper: Wrapper<Channels>;
  let vuetify: typeof Vuetify;

  store.commit('updateChannels', TestData.mockChannels);
  store.commit('updateTokens', TestData.mockTokens);

  function createWrapper(
    token: string = '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    shallow: boolean = false
  ) {
    vuetify = new Vuetify();

    const options = {
      vuetify,
      store,
      stubs: ['v-dialog'],
      mocks: {
        $router,
        $route: TestData.mockRoute({
          token
        }),
        $raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    };

    if (shallow) {
      return shallowMount(Channels, options);
    }
    return mount(Channels, options);
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
    expect(wrapper.findAll('.channel-list__channels__channel').length).toEqual(
      2
    );
  });

  test('navigate to home when the address is not in checksum format', async () => {
    wrapper = createWrapper('0xd0a1e359811322d97991e03f863a0c30c2cf029c', true);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME
      })
    );
  });

  test('navigate to home when the token cannot be found', async () => {
    wrapper = createWrapper('0x111157460c0F41EfD9107239B7864c062aA8B978', true);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect($router.push).toHaveBeenCalledTimes(1);
    expect($router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.HOME
      })
    );
  });

  test('collapse a channel when a new channel is expanded', async () => {
    wrapper = createWrapper();
    wrapper.find('#channel-278').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data['expanded']).toMatchObject({
      '278': true
    });

    wrapper.find('#channel-279').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data['expanded']).toMatchObject({
      '279': false
    });
  });

  test('collapsing a channel after expanding', async () => {
    wrapper = createWrapper();
    wrapper.find('#channel-278').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data['expanded']).toMatchObject({
      '278': true
    });

    wrapper.find('#channel-278').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data['expanded']).toMatchObject({
      '278': false
    });
  });

  test('clicking on deposit changes action', async () => {
    wrapper = createWrapper();
    wrapper.find('#channel-278').trigger('click');
    await wrapper.vm.$nextTick();
    wrapper.find('#deposit-0').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data['action']).toBe('deposit');
  });
});
