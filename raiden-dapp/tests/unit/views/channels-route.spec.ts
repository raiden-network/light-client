import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import type { RaidenChannel } from 'raiden-ts';
import { ChannelState } from 'raiden-ts';

import ChannelList from '@/components/channels/ChannelList.vue';
import ListHeader from '@/components/ListHeader.vue';
import type { Token } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import type { Tokens } from '@/types';
import ChannelsRoute from '@/views/ChannelsRoute.vue';

import { generateChannel, generateRoute, generateToken } from '../utils/data-generator';

jest.mock('vue-router');

Vue.use(Vuex);
Vue.use(Vuetify);

// Vue.filter('displayFormat', Filters.displayFormat);

const vuetify = new Vuetify();
const $router = new VueRouter() as jest.Mocked<VueRouter>;
const $raiden = { fetchAndUpdateTokenData: jest.fn() };
const token = generateToken({ address: '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B' }); // Must be a checksum address here;
const openChannel = generateChannel({ state: ChannelState.open }, token);
const closedChannel = generateChannel({ state: ChannelState.closed }, token);
const settableChannel = generateChannel({ state: ChannelState.settleable }, token);

function createWrapper(options?: {
  token?: Token;
  tokens?: Tokens;
  channels?: RaidenChannel[];
}): Wrapper<ChannelsRoute> {
  const selectedToken = options?.token ?? token;
  const $route = generateRoute({ params: { token: selectedToken.address } });
  const state = {
    tokens: options?.tokens ?? {
      [selectedToken.address]: selectedToken,
    },
  };

  const getters = {
    channels: () => () => options?.channels ?? [],
  };

  const store = new Vuex.Store({ state, getters });

  return shallowMount(ChannelsRoute, {
    vuetify,
    store,
    mocks: {
      $raiden,
      $router,
      $route,
      $t,
    },
  });
}

describe('ChannelsRoute.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('channel lists', () => {
    test('displays no channel list if there are no channels independet of their state.', () => {
      const wrapper = createWrapper({ channels: [] });
      const channelLists = wrapper.findAllComponents(ChannelList);

      expect(channelLists.length).toBe(0);
    });

    test('displays open channel list if there are some', () => {
      const wrapper = createWrapper({ channels: [openChannel] });
      const channelLists = wrapper.findAllComponents(ChannelList);
      const listHeaders = wrapper.findAllComponents(ListHeader);

      expect(channelLists.length).toBe(1);
      expect(listHeaders.length).toBe(1);
      expect(listHeaders.at(0).html()).toContain('channels.open.header');
    });

    test('displays closed channel list if there are some', () => {
      const wrapper = createWrapper({ channels: [closedChannel] });
      const channelLists = wrapper.findAllComponents(ChannelList);
      const listHeaders = wrapper.findAllComponents(ListHeader);

      expect(channelLists.length).toBe(1);
      expect(listHeaders.length).toBe(1);
      expect(listHeaders.at(0).html()).toContain('channels.closed.header');
    });

    test('displays settable channel list if there are some', () => {
      const wrapper = createWrapper({ channels: [settableChannel] });
      const channelLists = wrapper.findAllComponents(ChannelList);
      const listHeaders = wrapper.findAllComponents(ListHeader);

      expect(channelLists.length).toBe(1);
      expect(listHeaders.length).toBe(1);
      expect(listHeaders.at(0).html()).toContain('channels.settleable.header');
    });
  });

  describe('token route parameter', () => {
    test('navigates to home when the address is not in checksum format', async () => {
      const token = generateToken({ address: '0xd0a1e359811322d97991e03f863a0c30c2cf029c' });
      const wrapper = createWrapper({ token });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.HOME });
    });

    test('navigates to home when the token can not be found', async () => {
      const token = generateToken({ address: '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B' });
      const otherToken = generateToken({ address: '0x82641569b2062B545431cF6D7F0A418582865ba7' });
      const tokens = { [otherToken.address]: otherToken };
      const wrapper = createWrapper({ token, tokens });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.HOME });
    });
  });
});
