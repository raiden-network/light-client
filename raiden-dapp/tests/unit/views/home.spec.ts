jest.mock('@/services/raiden-service');
import flushPromises from 'flush-promises';
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import store from '@/store/index';
import Vuetify from 'vuetify';
import RaidenService from '@/services/raiden-service';
import { DeniedReason } from '@/model/types';
import Home from '@/views/Home.vue';

Vue.use(Vuex);
Vue.use(Vuetify);

describe('Home.vue', () => {
  let wrapper: Wrapper<Home>;
  let vuetify: typeof Vuetify;
  let $raiden: RaidenService;

  beforeEach(() => {
    vuetify = new Vuetify();
    $raiden = new RaidenService(store);
    $raiden.connect = jest.fn();
    wrapper = mount(Home, {
      vuetify,
      store,
      stubs: ['i18n', 'v-dialog'],
      mocks: {
        $raiden: $raiden,
        $t: (msg: string) => msg
      }
    });
  });

  test('shows connect dialog if there is no sub key setting yet', async () => {
    // @ts-ignore
    await wrapper.vm.connect();
    await flushPromises();

    expect(wrapper.vm.$data.connectDialog).toBe(true);
  });

  test('connects with sub key by default', async () => {
    store.commit('updateSettings', { useRaidenAccount: true });
    // @ts-ignore
    await wrapper.vm.connect();
    await flushPromises();

    expect($raiden.connect).toHaveBeenCalledTimes(1);
  });

  test('connect can be called without displaying error after failing initially', async () => {
    store.commit('accessDenied', DeniedReason.NO_ACCOUNT);
    store.commit('updateSettings', { useRaidenAccount: true });
    // @ts-ignore
    await wrapper.vm.connect();
    await flushPromises();

    expect(store.state.accessDenied).toEqual(DeniedReason.UNDEFINED);
  });

  test('displays welcome title', () => {
    const welcomeTitle = wrapper.find('.home__app-welcome');

    expect(welcomeTitle.text()).toBe('home.welcome');
  });

  test('displays disclaimer', () => {
    const disclaimer = wrapper.find('.home__disclaimer');

    expect(disclaimer.text()).toBe('home.disclaimer');
  });

  test('displays getting started link', () => {
    const gettingStartedText = wrapper.find('.home__getting-started');

    expect(gettingStartedText.text()).toContain(
      'home.getting-started.link-name'
    );
  });

  test('connect button displays connect dialog', async () => {
    expect(wrapper.vm.$data.connectDialog).toBe(false);

    const connectButton = wrapper.find('button');
    connectButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.connectDialog).toBe(true);

    const connectDialog = wrapper.find('.connect');

    expect(connectDialog.exists()).toBe(true);
  });
});
