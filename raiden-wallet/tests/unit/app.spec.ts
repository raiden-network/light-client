import { shallowMount } from '@vue/test-utils';
import App from '@/App.vue';
import Web3Service, { ProviderState } from '@/services/web3-service';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import { RootState } from '@/types';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';

jest.mock('@/services/web3-service');

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.use(VueRouter);

describe('App.vue', () => {
  let store: Store<RootState>;
  let $web3: Web3Service;

  beforeEach(() => {
    store = new Store({});
    store.commit = jest.fn();
    $web3 = new Web3Service();
  });

  it('should commit a deniedAccess when the provider access is denied', async () => {
    $web3.detectProvider = jest
      .fn()
      .mockResolvedValue(ProviderState.DENIED_ACCESS);

    const wrapper = shallowMount(App, {
      store,
      mocks: {
        $web3: $web3
      }
    });

    await flushPromises();

    expect(wrapper.vm.$store.commit).toBeCalledTimes(2);
    expect(wrapper.vm.$store.commit).toBeCalledWith('deniedAccess');
    expect(wrapper.vm.$store.commit).toBeCalledWith('loadComplete');
  });

  it('should commit a noProvider mutation when there is no provider detected', async function() {
    $web3.detectProvider = jest
      .fn()
      .mockResolvedValue(ProviderState.NO_PROVIDER);

    const wrapper = shallowMount(App, {
      store,
      mocks: {
        $web3: $web3
      }
    });

    await flushPromises();

    expect(wrapper.vm.$store.commit).toBeCalledTimes(2);
    expect(wrapper.vm.$store.commit).toBeCalledWith('noProvider');
    expect(wrapper.vm.$store.commit).toBeCalledWith('loadComplete');
  });

  it('should commit the users account when the initalization is complete', async function() {
    $web3.detectProvider = jest.fn().mockReturnValue(ProviderState.INITIALIZED);
    $web3.getAccount = jest.fn().mockResolvedValue('test');
    $web3.getBalance = jest.fn().mockResolvedValue('1');

    const wrapper = shallowMount(App, {
      store,
      mocks: {
        $web3: $web3
      }
    });

    await flushPromises();

    expect(wrapper.vm.$store.commit).toBeCalledTimes(3);
    expect(wrapper.vm.$store.commit).toBeCalledWith('account', 'test');
    expect(wrapper.vm.$store.commit).toBeCalledWith('loadComplete');
  });
});
