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

const createWrapper = (imprint: string, terms: string): Wrapper<App> => {
  if (imprint && terms) {
    process.env.VUE_APP_IMPRINT = imprint;
    process.env.VUE_APP_TERMS = terms;
  } else {
    delete process.env.VUE_APP_IMPRINT;
    delete process.env.VUE_APP_TERMS;
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
  test('displays privacy policy and terms if env variables are set', () => {
    const wrapper = createWrapper('https://custom-imprint.test', 'https://custom-terms.test');
    const privacyPolicy = wrapper.find('.imprint__policy');
    const terms = wrapper.find('.imprint__terms');

    const privacyPolicyUrl = privacyPolicy.find('a').attributes().href;
    const termsUrl = terms.find('a').attributes().href;

    expect(privacyPolicy.text()).toBe('application.privacy-policy');
    expect(privacyPolicyUrl).toBe('https://custom-imprint.test');

    expect(terms.text()).toBe('application.terms');
    expect(termsUrl).toBe('https://custom-terms.test');
  });

  test('does not display privacy policy and terms if env variable are not set', () => {
    const wrapper = createWrapper('', '');
    const privacyPolicy = wrapper.find('.imprint__policy');
    const terms = wrapper.find('.imprint__terms');

    expect(privacyPolicy.exists()).toBe(false);
    expect(terms.exists()).toBe(false);
  });

  test('disconnects on destruction', () => {
    const wrapper = createWrapper('', '');
    wrapper.vm.$destroy();

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });
});
