jest.mock('vue-router');
jest.mock('@/services/raiden-service');
jest.mock('@/i18n', () => jest.fn());
import { shallowMount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import store from '@/store/index';
import RaidenService from '@/services/raiden-service';
import App from '@/App.vue';
import Mocked = jest.Mocked;

Vue.use(VueRouter);
Vue.use(Vuex);
Vue.use(Vuetify);

let vuetify: Vuetify;
let router: Mocked<VueRouter>;
let $raiden: RaidenService;

const createWrapper = (imprint: string): Wrapper<App> => {
  if (imprint) {
    process.env.VUE_APP_IMPRINT = imprint;
  } else {
    delete process.env.VUE_APP_IMPRINT;
  }

  vuetify = new Vuetify();
  router = new VueRouter() as Mocked<VueRouter>;
  router.push = jest.fn().mockResolvedValue(null);
  $raiden = new RaidenService(store);
  $raiden.disconnect = jest.fn();

  return shallowMount(App, {
    vuetify,
    store,
    stubs: ['router-view', 'v-dialog'],
    mocks: {
      $router: router,
      $raiden: $raiden,
      $t: (msg: string) => msg,
    },
  });
};

describe('App.vue', () => {
  test('displays privacy policy if imprint env variable is set', () => {
    const wrapper = createWrapper('https://custom-imprint.test');
    const privacyPolicy = wrapper.find('.policy');
    const privacyPolicyUrl = privacyPolicy.find('a').attributes().href;

    expect(privacyPolicy.text()).toBe('application.privacy-policy');
    expect(privacyPolicyUrl).toBe('https://custom-imprint.test');
  });

  test('does not display privacy policy if imprint env variable is not set', () => {
    const wrapper = createWrapper('');
    const privacyPolicy = wrapper.find('.policy');

    expect(privacyPolicy.exists()).toBe(false);
  });

  test('disconnects on destruction', () => {
    const wrapper = createWrapper('');
    wrapper.vm.$destroy();

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
