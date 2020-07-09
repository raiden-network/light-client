jest.mock('vue-router');
jest.mock('@/services/raiden-service');
jest.mock('@/i18n', () => jest.fn());
import Mocked = jest.Mocked;
import { shallowMount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuex from 'vuex';
import store from '@/store/index';
import Vuetify from 'vuetify';
import RaidenService from '@/services/raiden-service';
import App from '@/App.vue';
import { Capabilities } from 'raiden-ts';

Vue.use(VueRouter);
Vue.use(Vuex);
Vue.use(Vuetify);

describe('App.vue', () => {
  let wrapper: Wrapper<App>;
  let vuetify: typeof Vuetify;
  let router: Mocked<VueRouter>;
  let $raiden: RaidenService;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn().mockResolvedValue(null);
    $raiden = new RaidenService(store);
    $raiden.disconnect = jest.fn();

    wrapper = shallowMount(App, {
      vuetify,
      store,
      stubs: ['router-view', 'v-dialog'],
      mocks: {
        $router: router,
        $raiden: $raiden,
        $t: (msg: string) => msg,
      },
    });
  });

  test('displays privacy policy', () => {
    const privacyPolicy = wrapper.find('.policy');

    expect(privacyPolicy.text()).toBe('application.privacy-policy');
  });

  test('disconnects on destruction', () => {
    wrapper.vm.$destroy();

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });

  test("show ReceivingDiabled dialog if can't receive", async () => {
    expect.assertions(2);

    store.commit('updateConfig', {
      caps: { [Capabilities.NO_RECEIVE]: false },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data.showReceivingDisabled).toBe(false);

    store.commit('updateConfig', {
      caps: { [Capabilities.NO_RECEIVE]: true },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$data.showReceivingDisabled).toBe(true);
  });
});
