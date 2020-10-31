jest.mock('@/services/raiden-service');
jest.mock('@/i18n', () => jest.fn());

import { constants } from 'ethers';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import { mount, Wrapper } from '@vue/test-utils';
import ChannelDialogs from '@/components/channels/ChannelDialogs.vue';
import Vuetify from 'vuetify';
import Vue from 'vue';
import { TestData } from '../../data/mock-data';
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;
import store from '@/store';
import Vuex from 'vuex';
import { Tokens } from '@/types';
import Filters from '@/filters';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.filter('truncate', Filters.truncate);

describe('ChannelDialogs.vue', () => {
  let wrapper: Wrapper<ChannelDialogs>;
  let vuetify: Vuetify;
  let $raiden: Mocked<RaidenService>;

  function createWrapper() {
    vuetify = new Vuetify();
    $raiden = new RaidenService(store) as Mocked<RaidenService>;
    return mount(ChannelDialogs, {
      vuetify,
      store,
      stubs: ['v-dialog'],
      propsData: {
        action: null,
        channel: null,
      },
      mocks: {
        $raiden,
        $t: (msg: string) => msg,
      },
    });
  }

  beforeEach(() => {
    wrapper = createWrapper();
  });

  test('default state is empty', () => {
    expect(wrapper.element.tagName).toBeUndefined();
  });

  test('close', async () => {
    wrapper.setProps({
      channel: TestData.openChannel,
      action: 'close',
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ConfirmationDialog).exists()).toBeTruthy();
  });

  test('settle', async () => {
    wrapper.setProps({
      channel: TestData.settlableChannel,
      action: 'settle',
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ConfirmationDialog).exists()).toBeTruthy();
  });

  test('deposit', async () => {
    const tokenAddress = TestData.openChannel.token;
    store.commit('updateTokens', {
      [tokenAddress]: { ...TestData.token, address: tokenAddress },
    } as Tokens);
    wrapper.setProps({
      channel: TestData.openChannel,
      action: 'deposit',
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ChannelDepositDialog).exists()).toBeTruthy();
  });

  describe('depositing', () => {
    beforeEach(() => {
      wrapper.setProps({
        channel: TestData.openChannel,
      });
    });

    test('success', async () => {
      await (wrapper.vm as any).deposit(constants.One);
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.deposit.success');
      expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });

    test('fail', async () => {
      $raiden.deposit.mockRejectedValueOnce(new Error('failed'));
      await (wrapper.vm as any).deposit(constants.One);
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.deposit.failure');
    });
  });

  describe('withdrawing', () => {
    beforeEach(() => {
      wrapper.setProps({
        channel: TestData.openChannel,
      });
    });

    test('success', async () => {
      await (wrapper.vm as any).withdraw(constants.One);
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.withdraw.success');
      expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });

    test('fail', async () => {
      $raiden.withdraw.mockRejectedValueOnce(new Error('failed'));
      await (wrapper.vm as any).withdraw(constants.One);
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.withdraw.failure');
    });
  });

  describe('closing', () => {
    beforeEach(() => {
      wrapper.setProps({
        channel: TestData.openChannel,
      });
    });

    test('success', async () => {
      await (wrapper.vm as any).close();
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.close.success');
      expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });

    test('fail', async () => {
      $raiden.closeChannel.mockRejectedValueOnce(new Error('failed'));
      await (wrapper.vm as any).close();
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.close.failure');
      // error dialog is shown instead of dismissing
      expect(wrapper.find('.error-message').isVisible()).toBeTruthy();
      expect(wrapper.find('.error-message__label + p').text()).toMatch(
        'failed'
      );
    });
  });

  describe('settling', () => {
    beforeEach(() => {
      wrapper.setProps({
        channel: TestData.settlableChannel,
      });
    });

    test('success', async () => {
      await (wrapper.vm as any).settle();
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.settle.success');
      expect(wrapper.emitted('dismiss')).toHaveLength(1);
    });

    test('fail', async () => {
      $raiden.settleChannel.mockRejectedValueOnce(new Error('failed'));
      await (wrapper.vm as any).settle();
      const messageEvent = wrapper.emitted('message');
      expect(messageEvent).toBeTruthy();
      const [firstMessageArg] = messageEvent?.shift();
      expect(firstMessageArg).toEqual('channel-list.messages.settle.failure');

      // error dialog is shown instead of dismissing
      expect(wrapper.find('.error-message').isVisible()).toBeTruthy();
      expect(wrapper.find('.error-message__label + p').text()).toMatch(
        'failed'
      );
    });
  });
});
