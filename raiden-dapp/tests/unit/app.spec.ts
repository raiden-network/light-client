jest.mock('@/services/raiden-service');

import { shallowMount } from '@vue/test-utils';
import App from '@/App.vue';
import RaidenService from '@/services/raiden-service';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import { RootState } from '@/types';
import Vuetify from 'vuetify';
import VueRouter from 'vue-router';
import flushPromises from 'flush-promises';
import { defaultState } from '@/store';

Vue.use(Vuex);
Vue.use(Vuetify);
Vue.use(VueRouter);

describe('App.vue', () => {
  let store: Store<RootState>;
  let $raiden: RaidenService;

  beforeEach(() => {
    store = new Store({
      state: defaultState()
    });
    store.commit = jest.fn();
    $raiden = new RaidenService(store);
    $raiden.connect = jest.fn();
    $raiden.disconnect = jest.fn();
  });

  it('should call connect on component creation and disconnect on destruction', async () => {
    const wrapper = shallowMount(App, {
      store,
      mocks: {
        $raiden: $raiden
      }
    });

    await (wrapper.vm as any).connect();

    await flushPromises();
    wrapper.vm.$destroy();

    expect($raiden.connect).toHaveBeenCalledTimes(1);
    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
