jest.mock('@/services/raiden-service');

import { shallowMount, Wrapper } from '@vue/test-utils';
import { DeniedReason } from '@/model/types';
import App from '@/App.vue';
import RaidenService from '@/services/raiden-service';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';
import store from '@/store/index';

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.use(VueRouter);

describe('App.vue', () => {
  let $raiden: RaidenService;

  beforeEach(() => {
    $raiden = new RaidenService(store);
    $raiden.connect = jest.fn();
    $raiden.disconnect = jest.fn();
  });

  describe('call connect on component creation and disconnect on destruction', async () => {
    let wrapper: Wrapper<App>;

    beforeEach(() => {
      wrapper = shallowMount(App, {
        store,
        mocks: {
          $raiden: $raiden,
          $t: (msg: string) => msg
        }
      });
    });

    test('call without subkey', async () => {
      await (wrapper.vm as any).connect();
      await flushPromises();
      wrapper.vm.$destroy();

      expect($raiden.connect).toHaveBeenCalledTimes(1);
      expect($raiden.disconnect).toHaveBeenCalledTimes(1);
    });

    test('call with subkey', async () => {
      await (wrapper.vm as any).connect(true);
      await flushPromises();
      wrapper.vm.$destroy();

      expect($raiden.connect).toHaveBeenCalledTimes(1);
      expect($raiden.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  test('connect can be called without error after failing initially', async () => {
    store.commit('accessDenied', DeniedReason.NO_ACCOUNT);
    const wrapper = shallowMount(App, {
      store,
      mocks: {
        $raiden: $raiden,
        $t: (msg: string) => msg
      }
    });

    await (wrapper.vm as any).connect();

    await flushPromises();
    expect(store.state.accessDenied).toEqual(DeniedReason.UNDEFINED);
  });
});
