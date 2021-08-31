/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';

import { RouteNames } from '@/router/route-names';
import OpenChannelRoute from '@/views/OpenChannelRoute.vue';

import { generateRoute } from '../utils/data-generator';

jest.mock('vue-router');

Vue.use(Vuetify);

const vuetify = new Vuetify();
const $router = new VueRouter() as jest.Mocked<VueRouter>;
const checksumTokenAddress = '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B';
const checksumPartnerAddress = '0x1D36124C90f53d491b6832F1c073F43E2550E35b';

function createWrapper(options?: {
  tokenAddress?: string;
  partnerAddress?: string;
  depositAmount?: string;
}): Wrapper<OpenChannelRoute> {
  const $route = generateRoute({
    params: {
      token: options?.tokenAddress ?? checksumTokenAddress,
      partner: options?.partnerAddress ?? checksumPartnerAddress,
    },
    query: {
      deposit: options?.depositAmount ?? '',
    },
  });

  return shallowMount(OpenChannelRoute, {
    vuetify,
    mocks: {
      $route,
      $router,
      $t,
    },
  });
}

describe('OpenChannelRoute.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('token address route parameter', () => {
    test('navigates to home when the address is not specified', async () => {
      const wrapper = createWrapper({ tokenAddress: '' });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.HOME });
    });

    test('navigates to home when the address is not in checksum format', async () => {
      const wrapper = createWrapper({
        tokenAddress: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
      });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.HOME });
    });

    test('successfuly displays route if address is in checksum format', async () => {
      const wrapper = createWrapper({ tokenAddress: checksumTokenAddress });

      await wrapper.vm.$nextTick();

      expect($router.push).not.toHaveBeenCalled();
    });
  });

  describe('partner address route parameter', () => {
    test('navigates to home when the address is not specified', async () => {
      const wrapper = createWrapper({ partnerAddress: '' });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.SELECT_TOKEN });
    });

    test('navigates to home when the address is not in checksum format', async () => {
      const wrapper = createWrapper({
        partnerAddress: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
      });

      await wrapper.vm.$nextTick();

      expect($router.push).toHaveBeenCalledTimes(1);
      expect($router.push).toHaveBeenLastCalledWith({ name: RouteNames.SELECT_TOKEN });
    });

    test('successfuly displays route if address is in checksum format', async () => {
      const wrapper = createWrapper({ partnerAddress: checksumPartnerAddress });

      await wrapper.vm.$nextTick();

      expect($router.push).not.toHaveBeenCalled();
    });
  });

  test('uses deposit amount query parameter if given', async () => {
    const wrapper = createWrapper({ depositAmount: '0.1' });

    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).depositAmount).toBe('0.1');
  });
});
