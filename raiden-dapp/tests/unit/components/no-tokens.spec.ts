jest.mock('vue-router');
import Mocked = jest.Mocked;
import { TestData } from '../data/mock-data';
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import VueRouter from 'vue-router';
import { RouteNames } from '@/router/route-names';
import Vuex from 'vuex';
import store from '@/store/index';
import Vuetify from 'vuetify';
import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { Tokens } from '@/types';
import NoTokens from '@/components/NoTokens.vue';

Vue.use(Vuex);
Vue.use(Vuetify);

describe('NoTokens.vue', () => {
  let wrapper: Wrapper<NoTokens>;
  let vuetify: typeof Vuetify;
  let router: Mocked<VueRouter>;

  beforeEach(() => {
    vuetify = new Vuetify();
    router = new VueRouter() as Mocked<VueRouter>;
    router.push = jest.fn();
    wrapper = mount(NoTokens, {
      vuetify,
      store,
      mocks: {
        $router: router,
        $t: (msg: string) => msg
      }
    });
  });

  test('displays new token button', () => {
    const newTokenButton = wrapper.find('.new-token__button');

    expect(newTokenButton.exists()).toBe(true);
  });

  test('displays new token title', () => {
    const newTokenTitle = wrapper.find('.new-token__header');

    expect(newTokenTitle.text()).toBe('tokens.connect-new');
  });

  test('navigates to SelectToken view when new token button is clicked', async () => {
    const newTokenButton = wrapper.find('button');
    newTokenButton.trigger('click');

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.SELECT_TOKEN
      })
    );
  });

  test('redirects to Transfer view when connected tokens are available', async () => {
    expect(router.push).toHaveBeenCalledTimes(0);

    store.commit('updateTokens', {
      [TestData.token.address]: TestData.token
    } as Tokens);
    store.commit('updateChannels', {
      [TestData.token.address]: {
        [TestData.openChannel.partner]: {
          ...TestData.openChannel,
          token: TestData.token.address
        } as RaidenChannel
      }
    } as RaidenChannels);
    await wrapper.vm.$nextTick();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RouteNames.TRANSFER
      })
    );
  });
});
