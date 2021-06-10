/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import Vue from 'vue';
import { Component, Mixins } from 'vue-property-decorator';
import Vuex from 'vuex';

import EthereumProviderDialogMixin from '@/mixins/ethereum-provider-dialog-mixin';
import { DirectRpcProvider } from '@/services/ethereum-provider';

jest.mock('@/services/ethereum-provider/direct-rpc-provider');

Vue.use(Vuex);

@Component({ template: '<div></div>' })
class TestComponent extends Mixins(EthereumProviderDialogMixin) {
  providerFactory = DirectRpcProvider;
  rpcUrl = '';
  privateKey = '';
}

const saveEthereumProviderOptions = jest.fn();
const getEthereumProviderOptions = jest.fn().mockReturnValue({});
const mutations = { saveEthereumProviderOptions };
const getters = { getEthereumProviderOptions: () => getEthereumProviderOptions };
const userSettings = {
  namespaced: true,
  getters,
  mutations,
};

function createWrapper(options?: {
  linkingInProgress?: boolean;
  canLink?: boolean;
  providerOptions?: unknown;
}): Wrapper<TestComponent> {
  const store = new Vuex.Store({
    modules: { userSettings },
  });

  const wrapper = shallowMount(TestComponent, { store });
  wrapper.setData({ linkingInProgress: options?.linkingInProgress ?? false });

  if (options?.canLink !== undefined) {
    Object.defineProperty(wrapper.vm, 'canLink', { get: () => options.canLink });
  }

  if (options?.providerOptions !== undefined) {
    Object.defineProperty(wrapper.vm, 'providerOptions', { get: () => options.providerOptions });
  }

  return wrapper;
}

describe('EthereumProviderDialogMixin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('enables linking per default', () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.canLink).toBeTruthy();
  });

  test('has empty provider options per default', () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.providerOptions).toMatchObject({});
  });

  test('loads saved provider options from store on creation', () => {
    getEthereumProviderOptions.mockReturnValueOnce({ rpcUrl: 'testUrl', privateKey: 'testKey' });
    const wrapper = createWrapper();

    expect(getEthereumProviderOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.rpcUrl).toBe('testUrl');
    expect(wrapper.vm.privateKey).toBe('testKey');
  });

  test('linking fails if not enabled', () => {
    const wrapper = createWrapper({ canLink: false });

    expect(wrapper.vm.link()).rejects.toThrowError('Can not link now!');
  });

  test('linking fails if already in progress', () => {
    const wrapper = createWrapper({ linkingInProgress: true });

    expect(wrapper.vm.link()).rejects.toThrowError('Can not link now!');
  });

  test('changes internal state to failed if provider factory throws', async () => {
    (DirectRpcProvider as any).link.mockRejectedValueOnce(new Error('failed'));
    const wrapper = createWrapper();
    expect(wrapper.vm.linkingFailed).toBeFalsy();

    await wrapper.vm.link();

    expect(wrapper.vm.linkingFailed).toBeTruthy();
  });

  test('resets the in progress state after linking finishes', async () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.linkingInProgress).toBeFalsy();

    // TODO: can we somehow check that it changes in-between?
    await wrapper.vm.link();

    expect(wrapper.vm.linkingInProgress).toBeFalsy();
  });

  test('linking calls the the factories link function with the correct options', async () => {
    const wrapper = createWrapper({
      providerOptions: { rpcUrl: 'testUrl', privateKey: 'testKey' },
    });
    expect(DirectRpcProvider.link).not.toHaveBeenCalled();

    await wrapper.vm.link();

    expect(DirectRpcProvider.link).toHaveBeenCalledTimes(1);
    expect(DirectRpcProvider.link).toHaveBeenLastCalledWith({
      rpcUrl: 'testUrl',
      privateKey: 'testKey',
    });
  });

  test('successful link saves provider options to store', async () => {
    const wrapper = createWrapper({
      providerOptions: { rpcUrl: 'testUrl', privateKey: 'testKey' },
    });
    expect(saveEthereumProviderOptions).not.toHaveBeenCalled();

    await wrapper.vm.link();

    expect(saveEthereumProviderOptions).toHaveBeenCalledTimes(1);
    expect(saveEthereumProviderOptions).toHaveBeenCalledWith(expect.anything(), {
      providerName: 'direct_rpc_provider_mock',
      providerOptions: { rpcUrl: 'testUrl', privateKey: 'testKey' },
    });
  });

  test('successful link emits linkEstablished event', async () => {
    const wrapper = createWrapper();
    expect(wrapper.emitted('linkEstablished')).toBeUndefined();

    await wrapper.vm.link();

    expect(wrapper.emitted('linkEstablished')?.length).toBe(1);
    expect(wrapper.emitted('linkEstablished')?.[0][1]).toBeInstanceOf(DirectRpcProvider);
  });

  test('linking successfully again after a failure resets the failure state', async () => {
    const wrapper = createWrapper();

    (DirectRpcProvider as any).link.mockRejectedValueOnce(new Error('failed'));
    await wrapper.vm.link();
    expect(wrapper.vm.linkingFailed).toBeTruthy();

    // Failing mock was only **once**.
    await wrapper.vm.link();
    expect(wrapper.vm.linkingFailed).toBeFalsy();
  });
});
