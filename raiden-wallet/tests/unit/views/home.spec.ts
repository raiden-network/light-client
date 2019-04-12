import RaidenService from '@/services/raiden-service';
import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import Vuetify from 'vuetify';
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils';
import Home from '@/views/Home.vue';
import { RootState } from '@/types';
import WalletCore from '@/components/WalletCore.vue';
import { defaultState } from '@/store';
import NoValidProvider from '@/components/NoValidProvider.vue';

jest.mock('@/services/raiden-service');
jest.mock('vue-router');

import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('Home.vue', function() {
  let wrapper: Wrapper<Home>;
  let service: Mocked<RaidenService>;
  let store: Store<RootState>;

  function vueFactory(
    service: RaidenService,
    store: Store<RootState>,
    data: {} = {}
  ): Wrapper<Home> {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    return shallowMount(Home, {
      localVue,
      store: store,
      mocks: {
        $raiden: service
      },
      propsData: data
    });
  }

  beforeEach(() => {
    store = new Store<RootState>({
      state: defaultState(),
      mutations: {
        failed(state: RootState) {
          state.providerDetected = false;
        },
        denied(state: RootState) {
          state.userDenied = true;
        }
      }
    });
    wrapper = vueFactory(service, store);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should display wallet core if everything is ok', function() {
    expect(wrapper.find(WalletCore)).toBeTruthy();
  });

  it('should display no provider if no provider detected', function() {
    store.commit('failed');
    expect(wrapper.find(NoValidProvider)).toBeTruthy();
  });

  it('should display a user denied message if user denied the provider connection', function() {
    store.commit('denied');
    expect(wrapper.find(NoValidProvider)).toBeTruthy();
  });
});
