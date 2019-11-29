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

  test('should display two channels entries', () => {
    const connections = wrapper.findAll('.channel-list__channels__channel');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(4);
  });

  test('should display a close and deposit action for an open channel', () => {
    wrapper.find('#channel-278').trigger('click');

    expect(wrapper.find('#close-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#deposit-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#settle-0').attributes('disabled')).toBeTruthy();
  });

  test('should display an no action entry when the channel is not open or settleable', () => {
    wrapper.find('#channel-281').trigger('click');

    expect(wrapper.find('#close-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-3').attributes('disabled')).toBeTruthy();
  });

  test('should display only settle in a settleable channel', () => {
    wrapper.find('#channel-280').trigger('click');

    expect(wrapper.find('#close-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-2').attributes('disabled')).toBeFalsy();
  });

  describe('closing a channel', () => {
    test('should close the channel when confirmed', async () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);

      await flushPromises();

      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(raiden.closeChannel).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner
      );
    });

    test('should show a success message on close success', async () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();

      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.close.success'
      );
    });

    test('should show an error message on close failure', async () => {
      raiden.closeChannel = jest
        .fn()
        .mockRejectedValue(new ChannelCloseFailed());
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.close.failure'
      );
    });

    test('should dismiss the dialog when cancel is pressed', () => {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.closeChannel).toHaveBeenCalledTimes(0);
    });
  });

  describe('depositing in a channel', () => {
    beforeEach(() => {
      raiden.deposit = jest.fn();
    });

    test('depositing 0.0 should just dismiss', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      await wrapper.vm.$nextTick();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.vm.$data.selectedChannel).toBeNull();
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });

    test('should deposit to the channel when confirmed', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      expect(wrapper.vm.$data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.deposit).toHaveBeenCalledTimes(1);
      expect(raiden.deposit).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner,
        new BigNumber(0.5 * 10 ** 10)
      );
    });

    test('should show a success message on deposit success', async () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.deposit.success'
      );
    });

    test('should show an error message on deposit failure', async () => {
      raiden.deposit.mockRejectedValue(new ChannelDepositFailed());
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      expect(wrapper.emitted()['visible-changed'][0][0]).toBe(
        'channel-278-deposit'
      );
      wrapper.setProps({
        visible: 'channel-278-deposit'
      });
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
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

    test('should dismiss the dialog when cancel is pressed', () => {
      raiden.deposit.mockResolvedValueOnce(undefined);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });
  });

  describe('settling a channel', () => {
    test('should settle the channel when confirmed', async () => {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      const $data = wrapper.vm.$data;

      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      expect($data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
      expect(raiden.settleChannel).toHaveBeenCalledWith(
        TestData.settlableChannel.token,
        TestData.settlableChannel.partner
      );
    });

    test('should show a success message when settle succeeds', async () => {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.settle.success'
      );
    });

    test('should show an error message on settle failure', async () => {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channel-list.messages.settle.failure'
      );
    });

    test('should dismiss the dialog when cancel is pressed', () => {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      wrapper.find('#cancel-280').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.settleChannel).toHaveBeenCalledTimes(0);
    });
  });
});
