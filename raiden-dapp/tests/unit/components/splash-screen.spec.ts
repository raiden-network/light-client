import Loading from '@/components/SplashScreen.vue';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store/index';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('SplashScreen.vue', () => {
  let wrapper: Wrapper<Loading>;
  let vuetify: typeof Vuetify;

  beforeEach(() => {
    vuetify = new Vuetify();
    wrapper = mount(Loading, {
      vuetify,
      store,
      stubs: ['i18n'],
      propsData: {
        connecting: false
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('show Raiden dApp welcome message', () => {
    expect(wrapper.vm.$data.welcome).toEqual('Welcome to the Raiden dApp');
  });
});
