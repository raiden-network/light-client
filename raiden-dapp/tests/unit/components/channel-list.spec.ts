jest.mock('@/services/raiden-service');

import Mocked = jest.Mocked;
import store from '@/store';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService, {
  ChannelCloseFailed,
  ChannelDepositFailed,
  ChannelSettleFailed
} from '@/services/raiden-service';
import Filters from '@/filters';
import flushPromises from 'flush-promises';
import { BigNumber } from 'ethers/utils';
import { mockInput } from '../utils/interaction-utils';
import ChannelList from '@/components/ChannelList.vue';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);
Vue.filter('displayFormat', Filters.displayFormat);

describe('ChannelList.vue', function() {
  let wrapper: Wrapper<ChannelList>;
  let raiden: Mocked<RaidenService>;
  let mockIdenticon: jest.Mock<any, any>;

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
    raiden.getToken = jest.fn().mockResolvedValue(TestData.token);
    mockIdenticon = jest.fn().mockResolvedValue('');
    const $identicon = {
      getIdenticon: mockIdenticon
    };

    wrapper = mount(ChannelList, {
      propsData: {
        tokenAddress: '0xtoken',
        channels: TestData.mockChannelArray,
        visible: ''
      },
      mocks: {
        $raiden: raiden,
        $identicon: $identicon,
        $t: (msg: string) => msg
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should display two channels entries', function() {
    const connections = wrapper.findAll('.channel');
    expect(connections.exists()).toBeTruthy();
    expect(connections.length).toBe(4);
  });

  it('should display a close and deposit action for an open channel', function() {
    expect(wrapper.find('#close-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#deposit-0').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#settle-0').attributes('disabled')).toBeTruthy();
  });

  it('should display an no action entry when the channel is not open or settleable', function() {
    expect(wrapper.find('#close-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-3').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-3').attributes('disabled')).toBeTruthy();
  });

  it('should display only settle in a settleable channel', function() {
    expect(wrapper.find('#close-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#deposit-2').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-2').attributes('disabled')).toBeFalsy();
  });

  describe('closing a channel', function() {
    it('should close the channel when confirmed', async function() {
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

    it('should show a success message on close success', async function() {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();

      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channels.messages.close.success'
      );
    });

    it('should show an error message on close failure', async function() {
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
        'channels.messages.close.failure'
      );
    });

    it('should dismiss the dialog when cancel is pressed', function() {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-close');
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.closeChannel).toHaveBeenCalledTimes(0);
    });
  });

  describe('depositing in a channel', function() {
    test('depositing 0.0 should just dismiss', async () => {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.vm.$data.selectedChannel).toBeNull();
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });

    it('should deposit to the channel when confirmed', async function() {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      expect(wrapper.vm.$data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.deposit).toHaveBeenCalledTimes(1);
      expect(raiden.deposit).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner,
        new BigNumber(0.5 * 10 ** 5)
      );
    });

    it('should show a success message on deposit success', async function() {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channels.messages.deposit.success'
      );
    });

    it('should show an error message on deposit failure', async function() {
      raiden.deposit = jest.fn().mockRejectedValue(new ChannelDepositFailed());
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      expect(wrapper.emitted()['visible-changed'][0][0]).toBe(
        'channel-278-deposit'
      );
      wrapper.setProps({
        visible: 'channel-278-deposit'
      });
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');
      expect(wrapper.emitted()['visible-changed'][1][0]).toBe('');
      wrapper.setProps({
        visible: ''
      });
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channels.messages.deposit.failure'
      );
    });

    it('should dismiss the dialog when cancel is pressed', function() {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      elementVisibilityChanged(0, 'channel-278-deposit');
      wrapper.find('#cancel-278').trigger('click');
      elementVisibilityChanged(1);
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });
  });

  describe('settling a channel', function() {
    it('should settle the channel when confirmed', async function() {
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

    it('should show a success message when settle succeeds', async function() {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      elementVisibilityChanged(0, 'channel-280-settle');
      wrapper.find('#confirm-280').trigger('click');
      elementVisibilityChanged(1);
      await flushPromises();
      expect(wrapper.emitted()['message'][0][0]).toBe(
        'channels.messages.settle.success'
      );
    });

    it('should show an error message on settle failure', async function() {
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
        'channels.messages.settle.failure'
      );
    });

    it('should dismiss the dialog when cancel is pressed', function() {
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
