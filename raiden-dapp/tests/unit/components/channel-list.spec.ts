import Mocked = jest.Mocked;

jest.mock('@/services/raiden-service');

import { addElemWithDataAppToBody } from '../utils/dialog';
import store from '@/store';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import ChannelList from '@/components/ChannelList.vue';
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

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);
Vue.filter('displayFormat', Filters.displayFormat);

describe('ChannelList.vue', function() {
  addElemWithDataAppToBody();

  let wrapper: Wrapper<ChannelList>;
  let raiden: Mocked<RaidenService>;
  let mockIdenticon: jest.Mock<any, any>;

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
        channels: TestData.mockChannelArray
      },
      mocks: {
        $raiden: raiden,
        $identicon: $identicon
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
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('');
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('channel-278');
      wrapper.find('#confirm-278').trigger('click');

      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('');
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
      wrapper.find('#confirm-278').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Channel close successful');
    });

    it('should show an error message on close failure', async function() {
      raiden.closeChannel = jest
        .fn()
        .mockRejectedValue(new ChannelCloseFailed());
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      wrapper.find('#confirm-278').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Channel close failed');
    });

    it('should dismiss the dialog when cancel is pressed', function() {
      raiden.closeChannel = jest.fn().mockReturnValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('channel-278');
      wrapper.find('#cancel-278').trigger('click');
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('');
      expect(raiden.closeChannel).toHaveBeenCalledTimes(0);
    });

    test('dismiss the confirmation when overlay is pressed', function() {
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#close-0').trigger('click');
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('channel-278');
      wrapper.find('.overlay').trigger('click');
      expect(wrapper.vm.$data.visibleCloseConfirmation).toBe('');
    });
  });

  describe('depositing in a channel', function() {
    test('depositing 0.0 should just dismiss', async () => {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      const $data = wrapper.vm.$data;
      expect($data.visibleDeposit).toBe('');
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      expect($data.visibleDeposit).toBe('channel-278');
      wrapper.find('#confirm-278').trigger('click');

      expect($data.visibleDeposit).toBe('');
      expect($data.selectedChannel).toBeNull();

      await flushPromises();
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });

    it('should deposit to the channel when confirmed', async function() {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      const $data = wrapper.vm.$data;
      expect($data.visibleDeposit).toBe('');
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      expect($data.visibleDeposit).toBe('channel-278');
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');

      expect($data.visibleDeposit).toBe('');
      expect($data.selectedChannel).toBeNull();

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
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Deposit was successful');
    });

    it('should show an error message on deposit failure', async function() {
      raiden.deposit = jest.fn().mockRejectedValue(new ChannelDepositFailed());
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      mockInput(wrapper, '0.5');
      wrapper.find('#confirm-278').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Deposit failed');
    });

    it('should dismiss the dialog when cancel is pressed', function() {
      raiden.deposit = jest.fn().mockResolvedValue(null);
      wrapper.find('#channel-278').trigger('click');
      wrapper.find('#deposit-0').trigger('click');
      expect(wrapper.vm.$data.visibleDeposit).toBe('channel-278');
      wrapper.find('#cancel-278').trigger('click');
      expect(wrapper.vm.$data.visibleDeposit).toBe('');
      expect(raiden.deposit).toHaveBeenCalledTimes(0);
    });
  });

  describe('settling a channel', function() {
    it('should settle the channel when confirmed', async function() {
      raiden.settleChannel = jest.fn().mockReturnValue('thxhash');
      const $data = wrapper.vm.$data;
      expect($data.visibleSettleConfirmation).toBe('');
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      expect($data.visibleSettleConfirmation).toBe('channel-280');
      wrapper.find('#confirm-280').trigger('click');

      expect($data.visibleSettleConfirmation).toBe('');
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
      wrapper.find('#confirm-280').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Channel settle was successful');
    });

    it('should show an error message on settle failure', async function() {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      wrapper.find('#confirm-280').trigger('click');
      await flushPromises();
      expect(wrapper.vm.$data.snackbar).toBe(true);
      expect(wrapper.vm.$data.message).toBe('Channel settle failed');
    });

    it('should dismiss the dialog when cancel is pressed', function() {
      raiden.settleChannel = jest
        .fn()
        .mockRejectedValue(new ChannelSettleFailed());
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      expect(wrapper.vm.$data.visibleSettleConfirmation).toBe('channel-280');
      wrapper.find('#cancel-280').trigger('click');
      expect(wrapper.vm.$data.visibleSettleConfirmation).toBe('');
      expect(raiden.settleChannel).toHaveBeenCalledTimes(0);
    });

    test('clicking on the overlay should dismiss the confirmation', () => {
      wrapper.find('#channel-280').trigger('click');
      wrapper.find('#settle-2').trigger('click');
      expect(wrapper.vm.$data.visibleSettleConfirmation).toBe('channel-280');
      wrapper.find('.overlay').trigger('click');
      expect(wrapper.vm.$data.visibleSettleConfirmation).toBe('');
    });
  });
});
