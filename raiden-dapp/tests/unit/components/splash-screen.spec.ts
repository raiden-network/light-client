import Loading from '@/components/SplashScreen.vue';
import { mount, Wrapper } from '@vue/test-utils';
import store from '@/store/index';
import Vuetify from 'vuetify';
import Vue from 'vue';

Vue.use(Vuetify);

describe('SplashScreen.vue', () => {
  let wrapper: Wrapper<Loading>;

  beforeEach(() => {
    wrapper = mount(Loading, {
      store,
      propsData: {
        connecting: false
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });
  });

  test('name should be Raiden dApp', () => {
    expect(wrapper.vm.$data.name).toEqual('Raiden dApp');
  });
});
