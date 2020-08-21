jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import TransferRoute from '@/views/TransferRoute.vue';
import { TestData } from '../data/mock-data';
import { One } from 'ethers/constants';
import { Token } from '@/model/types';

Vue.use(Vuetify);

describe('TransferRoute.vue', () => {
  const vuetify = new Vuetify();
  const router = new VueRouter() as Mocked<VueRouter>;
  const token: Token = TestData.token;
  const openChannel = TestData.openChannel;

  openChannel.capacity = One;

  store.commit('updateTokens', { '0xtoken': token });
  store.commit('updateChannels', {
    '0xtoken': { '0xaddr': openChannel },
  });

  router.push = jest.fn().mockImplementation(() => Promise.resolve());

  const wrapper: Wrapper<TransferRoute> = mount(TransferRoute, {
    vuetify,
    store,
    mocks: {
      $router: router,
      $route: TestData.mockRoute({
        token: '0xtoken',
      }),
      $t: (msg: string) => msg,
    },
  });

  test('component can get token', () => {
    expect((wrapper.vm as any).token).toEqual(token);
  });

  test('component can get channel capacity', () => {
    expect((wrapper.vm as any).capacity).toEqual(One);
  });
});
