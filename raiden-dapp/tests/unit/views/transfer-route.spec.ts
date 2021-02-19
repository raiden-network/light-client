/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { constants } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import NoTokens from '@/components/NoTokens.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import type { Tokens } from '@/types';
import TransferRoute from '@/views/TransferRoute.vue';

import { generateChannel, generateToken } from '../utils/data-generator';

jest.mock('vue-router');
jest.useFakeTimers();

Vue.use(Vuetify);
Vue.use(Vuex);

const vuetify = new Vuetify();
const firstToken = generateToken();
const otherToken = generateToken({ address: '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B' }); // Must be a checksum address here;
const channel = generateChannel({}, firstToken);
const notifyAddOrReplaceSpy = jest.fn();
const updateStateBackupReminderDateSpy = jest.fn();

async function createWrapper({
  tokens,
  tokenRouteParameter,
  channels,
  openChannels,
  stateBackupReminderDateMs,
  transferAmountQueryParameter,
  targetAddressQueryParameter,
}: {
  tokens?: Tokens;
  tokenRouteParameter?: string;
  channels?: { [key: string]: RaidenChannel[] };
  openChannels?: boolean;
  stateBackupReminderDateMs?: number;
  transferAmountQueryParameter?: string;
  targetAddressQueryParameter?: string;
} = {}): Promise<Wrapper<TransferRoute>> {
  channels = channels ?? { [firstToken.address]: [channel] };

  const state = {
    tokens: tokens ?? { [firstToken.address]: firstToken, [otherToken.address]: otherToken },
    stateBackupReminderDateMs: stateBackupReminderDateMs ?? 0,
  };

  const getters = {
    channels: () => (tokenAddress: string) => channels![tokenAddress] ?? [],
    // This simplified version that expects one open channel per token none
    channelWithBiggestCapacity: () => (tokenAddress: string) =>
      (channels![tokenAddress] ?? [])[0] ?? null,
    openChannels: () => openChannels,
  };
  const mutations = {
    updateStateBackupReminderDate: updateStateBackupReminderDateSpy,
    'notifications/notificationAddOrReplace': notifyAddOrReplaceSpy,
  };

  const store = new Vuex.Store({
    state,
    getters,
    mutations,
  });

  const wrapper = shallowMount(TransferRoute, {
    vuetify,
    store,
    mocks: {
      $route: {
        params: { token: tokenRouteParameter },
        query: { amount: transferAmountQueryParameter, target: targetAddressQueryParameter },
      },
      $t: (msg: string) => msg,
    },
  });

  await wrapper.vm.$nextTick(); // Make sure all immediate watchers can run through.
  return wrapper;
}

describe('TransferRoute.vue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TODO: This and the following test case their description are a hint that
  // the components template is not too nice.
  test('displays no tokens component if there are no tokens and hide rest', async () => {
    const wrapper = await createWrapper({ tokens: {} });
    expect(wrapper.findComponent(NoTokens).exists()).toBe(true);
    expect(wrapper.findComponent(TransferHeaders).exists()).toBe(false);
    expect(wrapper.findComponent(TransferInputs).exists()).toBe(false);
    expect(wrapper.findComponent(TransactionList).exists()).toBe(false);
  });

  test('does not display no tokens component if there are no tokens, but rest', async () => {
    const wrapper = await createWrapper();
    expect(wrapper.findComponent(NoTokens).exists()).toBe(false);
    expect(wrapper.findComponent(TransferHeaders).exists()).toBe(true);
    expect(wrapper.findComponent(TransferInputs).exists()).toBe(true);
    expect(wrapper.findComponent(TransactionList).exists()).toBe(true);
  });

  test('shows dialog if there are no open channels', async () => {
    const wrapper = await createWrapper({ channels: {} });
    expect(wrapper.findComponent(NoChannelsDialog).exists()).toBe(true);
  });

  test('uses first available token as default if no route parameter is provided', async () => {
    const wrapper = await createWrapper({ tokenRouteParameter: '' });
    expect((wrapper.vm as any).token).toEqual(firstToken);
  });

  test('picks up token from route parameter', async () => {
    const wrapper = await createWrapper({ tokenRouteParameter: otherToken.address });
    expect((wrapper.vm as any).token).toEqual(otherToken);
  });

  test('updates token if route parameter changes', async () => {
    const wrapper = await createWrapper();
    expect((wrapper.vm as any).token).toEqual(firstToken);

    wrapper.vm.$route.params.token = otherToken.address;
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).token).toEqual(otherToken);
  });

  test('uses first available token if route parameter gets removed', async () => {
    const wrapper = await createWrapper({ tokenRouteParameter: otherToken.address });
    expect((wrapper.vm as any).token).toEqual(otherToken);

    wrapper.vm.$route.params.token = '';
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).token).toEqual(firstToken);
  });

  test('picks up transfer amount by query parameter', async () => {
    const wrapper = await createWrapper({ transferAmountQueryParameter: '3' });
    expect((wrapper.vm as any).transferAmount).toEqual('3');
  });

  test('updates transfer amount if query parameter changes', async () => {
    const wrapper = await createWrapper();
    expect((wrapper.vm as any).transferAmount).toEqual('');

    wrapper.vm.$route.query.amount = '3';
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).transferAmount).toEqual('3');
  });

  test('clears transfer amount if query parameter gets removed', async () => {
    const wrapper = await createWrapper({ transferAmountQueryParameter: '3' });
    expect((wrapper.vm as any).transferAmount).toEqual('3');

    wrapper.vm.$route.query.amount = '';
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).transferAmount).toEqual('');
  });

  test('picks up target address by query parameter', async () => {
    const wrapper = await createWrapper({
      targetAddressQueryParameter: '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B',
    });
    expect((wrapper.vm as any).targetAddress).toEqual(
      '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B',
    );
  });

  test('updates target address if query parameter changes', async () => {
    const wrapper = await createWrapper();
    expect((wrapper.vm as any).targetAddress).toEqual('');

    wrapper.vm.$route.query.target = '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B';
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).targetAddress).toEqual(
      '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B',
    );
  });

  test('clears target address if query parameter gets removed', async () => {
    const wrapper = await createWrapper({
      targetAddressQueryParameter: '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B',
    });
    expect((wrapper.vm as any).targetAddress).toEqual(
      '0xd1fC2cE93469927fD75Be012bd04Bc803Ba27c9B',
    );

    wrapper.vm.$route.query.target = '';
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as any).targetAddress).toEqual('');
  });

  test('can get channel capacity for selected token', async () => {
    const wrapper = await createWrapper({ tokenRouteParameter: firstToken.address });
    expect((wrapper.vm as any).totalCapacity).toEqual(channel.capacity);
  });

  test('capacity is zero if there is no token', async () => {
    const wrapper = await createWrapper({ tokens: {} });
    expect((wrapper.vm as any).totalCapacity).toEqual(constants.Zero);
  });

  test('notifies about backing up state if user has never been notified', async () => {
    createWrapper({ stateBackupReminderDateMs: 0 });
    expect(notifyAddOrReplaceSpy).toHaveBeenCalledTimes(1);
  });

  test('set backup reminder date after user got notified', async () => {
    createWrapper({ stateBackupReminderDateMs: 0 });
    expect(updateStateBackupReminderDateSpy).toHaveBeenCalledTimes(1);
  });

  test('notifies about backing up state if more than one day passes', async () => {
    createWrapper({ stateBackupReminderDateMs: 1 });
    expect(notifyAddOrReplaceSpy).toHaveBeenCalledTimes(1);
  });

  test('does not notify about backing up state if less than one day passes', async () => {
    const currentTime = new Date().getTime();
    createWrapper({ stateBackupReminderDateMs: currentTime });
    expect(notifyAddOrReplaceSpy).not.toHaveBeenCalledTimes(1);
  });
});
