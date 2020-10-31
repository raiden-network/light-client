jest.mock('vue-router');
import { shallowMount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { constants } from 'ethers';
import TransferRoute from '@/views/TransferRoute.vue';
import NoTokens from '@/components/NoTokens.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import { generateChannel, generateToken } from '../utils/data-generator';

Vue.use(Vuetify);
Vue.use(Vuex);

describe('TransferRoute.vue', () => {
  const vuetify = new Vuetify();
  const token = generateToken();
  const channel = generateChannel({}, token);

  function createWrapper(
    tokenParameter = token.address,
    tokens = [token],
    channels = [channel]
  ): Wrapper<TransferRoute> {
    const getters = {
      tokens: () => tokens,
      token: () => (tokenAddress: string) =>
        tokens.filter(({ address }) => address === tokenAddress)?.[0] ?? null,
      // This simplified version that expects one open channel per token none
      channelWithBiggestCapacity: () => (tokenAddress: string) =>
        channels.filter(({ token }) => token === tokenAddress)?.[0] ?? null,
      openChannels: () => channels,
    };

    const store = new Vuex.Store({ getters });
    return shallowMount(TransferRoute, {
      vuetify,
      store,
      mocks: {
        $route: { params: { token: tokenParameter }, query: {} },
        $t: (msg: string) => msg,
      },
    });
  }

  // TODO: This and the following test case their description are a hint that
  // the components template is not too nice.
  test('displays no tokens component if there are no tokens and hide rest', () => {
    const wrapper = createWrapper('', []);
    expect(wrapper.findComponent(NoTokens).exists()).toBe(true);
    expect(wrapper.findComponent(TransferHeaders).exists()).toBe(false);
    expect(wrapper.findComponent(TransferInputs).exists()).toBe(false);
    expect(wrapper.findComponent(TransactionList).exists()).toBe(false);
  });

  test('do not displays no tokens component if there are no tokens, but rest', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent(NoTokens).exists()).toBe(false);
    expect(wrapper.findComponent(TransferHeaders).exists()).toBe(true);
    expect(wrapper.findComponent(TransferInputs).exists()).toBe(true);
    expect(wrapper.findComponent(TransactionList).exists()).toBe(true);
  });

  test('show dialog if there are no open channels', () => {
    const wrapper = createWrapper(token.address, [token], []);
    expect(wrapper.findComponent(NoChannelsDialog).exists()).toBe(true);
  });

  test('component can get token from route parameter', () => {
    const wrapper = createWrapper();
    expect((wrapper.vm as any).token).toEqual(token);
  });

  test('uses first token as default if no routing parameter provided', () => {
    const wrapper = createWrapper('');
    expect((wrapper.vm as any).token).toEqual(token);
  });

  test('token is undefined if user has none connected', () => {
    const wrapper = createWrapper(token.address, []);
    expect((wrapper.vm as any).token).toBeUndefined();
  });

  test('component can get channel capacity from route parameter', () => {
    const wrapper = createWrapper();
    expect((wrapper.vm as any).capacity).toEqual(channel.capacity);
  });

  test('capacity is zero if there is the token is undefined', () => {
    const wrapper = createWrapper('', [], []);
    expect((wrapper.vm as any).capacity).toEqual(constants.Zero);
  });
});
