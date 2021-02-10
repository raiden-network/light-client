/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { constants } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import NoTokens from '@/components/NoTokens.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import TransferRoute from '@/views/TransferRoute.vue';

import { generateChannel, generateToken } from '../utils/data-generator';

jest.mock('vue-router');
jest.useFakeTimers();

Vue.use(Vuetify);
Vue.use(Vuex);

describe('TransferRoute.vue', () => {
  const vuetify = new Vuetify();
  const token = generateToken();
  const channel = generateChannel({}, token);
  let pushStateBackupNotificationSpy: jest.SpyInstance;

  beforeEach(() => {
    pushStateBackupNotificationSpy = jest.spyOn(
      /*
      This workaround is used because the class component
      library results in a property does not exist error.
      */
      TransferRoute.prototype.constructor.options.methods,
      'pushStateBackupNotification',
    );
  });

  afterEach(() => jest.restoreAllMocks());

  function createWrapper(
    tokenParameter = token.address,
    tokens = [token],
    channels = [channel],
    stateBackupReminderDateMs = 0,
  ): Wrapper<TransferRoute> {
    const state = {
      stateBackupReminderDateMs,
    };
    const getters = {
      tokens: () => tokens,
      token: () => (tokenAddress: string) =>
        tokens.filter(({ address }) => address === tokenAddress)?.[0] ?? null,
      // This simplified version that expects one open channel per token none
      channelWithBiggestCapacity: () => (tokenAddress: string) =>
        channels.filter(({ token }) => token === tokenAddress)?.[0] ?? null,
      channels: () => (_: string) => channels,
      openChannels: () => channels,
    };
    const mutations = {
      updateStateBackupReminderDate: jest.fn(),
      'notifications/notificationAddOrReplace': jest.fn(),
    };

    const store = new Vuex.Store({
      state,
      getters,
      mutations,
    });

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

  test('does not display no tokens component if there are no tokens, but rest', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent(NoTokens).exists()).toBe(false);
    expect(wrapper.findComponent(TransferHeaders).exists()).toBe(true);
    expect(wrapper.findComponent(TransferInputs).exists()).toBe(true);
    expect(wrapper.findComponent(TransactionList).exists()).toBe(true);
  });

  test('shows dialog if there are no open channels', () => {
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
    expect((wrapper.vm as any).totalCapacity).toEqual(channel.capacity);
  });

  test('capacity is zero if there is the token is undefined', () => {
    const wrapper = createWrapper('', [], []);
    expect((wrapper.vm as any).totalCapacity).toEqual(constants.Zero);
  });

  test('notifies about backing up state if user has never been notified', () => {
    createWrapper(token.address, [token], [], 0);
    expect(pushStateBackupNotificationSpy).toHaveBeenCalled();
  });

  test('notifies about backing up state if more than one day passes', () => {
    createWrapper(token.address, [token], [], 1);
    expect(pushStateBackupNotificationSpy).toHaveBeenCalled();
  });

  test('does not notify about backing up state if less than one day passes', () => {
    const currentTime = new Date().getTime();
    createWrapper(token.address, [token], [], currentTime);
    expect(pushStateBackupNotificationSpy).not.toHaveBeenCalled();
  });
});
