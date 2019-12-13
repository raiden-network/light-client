jest.mock('@/services/raiden-service');

import Mocked = jest.Mocked;

import store from '@/store/index';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService, {
  ChannelCloseFailed,
  ChannelDepositFailed,
  ChannelSettleFailed
} from '@/services/raiden-service';
import Filters from '@/filters';
import flushPromises from 'flush-promises';
import { $identicon } from '../utils/mocks';
import { BigNumber, parseUnits } from 'ethers/utils';
import { mockInput } from '../utils/interaction-utils';
import ChannelList from '@/components/ChannelList.vue';
import { Token } from '@/model/types';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);
Vue.filter('displayFormat', Filters.displayFormat);

const localVue = createLocalVue();

describe('ChannelList.vue', () => {
  let wrapper: Wrapper<ChannelList>;
  let raiden: Mocked<RaidenService>;
  let vuetify: typeof Vuetify;

  function elementVisibilityChanged(
    eventIndex: number,
    elementVisible: string = ''
  ) {
    expect(wrapper.emitted()['visible-changed'][eventIndex][0]).toBe(
      elementVisible
    );
    wrapper.setProps({
      visible: elementVisible
    });
  }

  beforeEach(() => {
    raiden = new RaidenService(store) as Mocked<RaidenService>;

    vuetify = new Vuetify();

    wrapper = mount(ChannelList, {
      localVue,
      vuetify,
      propsData: {
        token: {
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 10,
          balance: parseUnits('2', 10)
        } as Token,
        channels: TestData.mockChannelArray,
        visible: ''
      },
      mocks: {
        $raiden: raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('show four channels entries', () => {
    const connections = wrapper.findAll('.channel-list__channels__channel');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(4);
  });

  test('disable the settle button when a channel is "open"', async () => {
    wrapper.find('#channel-278').trigger('click');

    await wrapper.vm.$nextTick();

    expect(wrapper.find('#close-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#deposit-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#settle-0').attributes('disabled')).toBeTruthy();
  });

  test('disable all buttons when a channel is "closed"', async () => {
    wrapper.find('#channel-281').trigger('click');

    await wrapper.vm.$nextTick();

    expect(wrapper.find('#close-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-3').attributes('disabled')).toBeTruthy();
  });

  test('enable settle button when a channel is "settlable"', async () => {
    wrapper.find('#channel-280').trigger('click');

    await wrapper.vm.$nextTick();

    expect(wrapper.find('#close-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-2').attributes('disabled')).toBeFalsy();
  });

  describe('close a channel', () => {
    test('close the channel when the user confirms', async () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);

      await flushPromises();

      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(raiden.closeChannel).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner
      );
    });

    test('show a success message when the channel closes successfully', async () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();

      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.close.success'
      );
    });

    test('show an error message when close fails', async () => {
      raiden.closeChannel = jest
        .fn()
        .mockRejectedValue(new ChannelCloseFailed());
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.close.failure'
      );
    });

    test('close the confirmation when the user presses cancel', async () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      await flushPromises();
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.closeChannel).toHaveBeenCalledTimes(0);
    });
  });

  describe('deposit in a channel', () => {
    beforeEach(() => {
      raiden.deposit = jest.fn();
    });

    test('deposit to the channel when the user confirms the action', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      await flushPromises();
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      await wrapper.vm.$nextTick();
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.vm.$data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.deposit).toHaveBeenCalledTimes(1);
      expect(raiden.deposit).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner,
        new BigNumber(0.5 * 10 ** 10)
      );
    });

    test('show a success message when the deposit is successful', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      await flushPromises();
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.deposit.success'
      );
    });

    test('show an error message when the deposit fails', async () => {
      raiden.deposit.mockRejectedValue(new ChannelDepositFailed());
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#deposit-0').trigger('click');
      expect(wrapper.emitted()['visible-changed'][0][0]).toBe(
        'channel-278-deposit'
      );
      wrapper.setProps({
        visible: 'channel-278-deposit'
      });
      await flushPromises();
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      await flushPromises();
      wrapper.find('#confirm-278').trigger('click');
      expect(wrapper.emitted()['visible-changed'][1][0]).toBe('');
      wrapper.setProps({
        visible: ''
      });
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.deposit.failure'
      );
    });

    test('dismiss the dialog when the user presses cancel', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      await flushPromises();
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });
  });

  describe('settle a channel', () => {
    test('settle the channel when the user confirms the action', async () => {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      const $data = wrapper.vm.$data;

      wrapper.find('#channel-280').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      await flushPromises();
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await wrapper.vm.$nextTick();
      expect($data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
      expect(raiden.settleChannel).toHaveBeenCalledWith(
        TestData.settlableChannel.token,
        TestData.settlableChannel.partner
      );
    });

    test('show a success message when the settle is successful', async () => {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      wrapper.find('#channel-280').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      await flushPromises();
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.settle.success'
      );
    });

    test('show an error message when settle fails', async () => {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      await flushPromises();
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.settle.failure'
      );
    });

    test('dismiss the dialog when the user presses cancel', async () => {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      await flushPromises();
      wrapper.find('#cancel-280').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.settleChannel).toHaveBeenCalledTimes(0);
    });
  });
});
