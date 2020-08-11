jest.mock('vue-router');
import Mocked = jest.Mocked;
import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import store from '@/store';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Transfer from '@/components/navigation/Transfer.vue';
import { TestData } from '../../data/mock-data';
import { One, Zero } from 'ethers/constants';
import { Token } from '@/model/types';
import { ChannelState } from 'raiden-ts';

Vue.use(Vuetify);

describe('Transfer.vue', () => {
  const vuetify = new Vuetify();
  const router = new VueRouter() as Mocked<VueRouter>;
  const token: Token = {
    address: '0xtoken',
    balance: One,
    decimals: 18,
    symbol: 'TTT',
    name: 'Test Token',
  };

  store.commit('updateTokens', { '0xtoken': token });
  store.commit('updateChannels', {
    '0xtoken': {
      '0xaddr': {
        capacity: One,
        balance: Zero,
        ownDeposit: One,
        partnerDeposit: Zero,
        partner: '0xaddr' as any,
        token: '0xtoken' as any,
        state: ChannelState.open,
        settleTimeout: 500,
        tokenNetwork: '0xtokennetwork' as any,
        closeBlock: undefined,
        openBlock: 12346,
        id: 1,
      },
    },
  });

  router.push = jest.fn().mockImplementation(() => Promise.resolve());

  const wrapper: Wrapper<Transfer> = mount(Transfer, {
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
