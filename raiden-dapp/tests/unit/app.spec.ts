jest.mock('@/services/raiden-service');
import { shallowMount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import store from '@/store/index';
import Vuetify from 'vuetify';
import RaidenService from '@/services/raiden-service';
import App from '@/App.vue';

Vue.use(VueRouter);
Vue.use(Vuetify);

describe('App.vue', () => {
  let wrapper: Wrapper<App>;
  let vuetify: typeof Vuetify;
  let $raiden: RaidenService;

  beforeEach(() => {
    $raiden = new RaidenService(store);
    $raiden.disconnect = jest.fn();
    wrapper = shallowMount(App, {
      vuetify,
      mocks: {
        $raiden: $raiden,
        $t: (msg: string) => msg
      }
    });
  });

  test('disconnects on destruction', () => {
    wrapper.vm.$destroy();

    expect($raiden.disconnect).toHaveBeenCalledTimes(1);
  });

  test('displays privacy policy', () => {
    const privacyPolicy = wrapper.find('.policy');

    expect(privacyPolicy.text()).toBe('application.privacy-policy');
  });
});
