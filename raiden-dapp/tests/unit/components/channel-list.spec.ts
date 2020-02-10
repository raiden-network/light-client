jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import Mocked = jest.Mocked;

import store from '@/store/index';
import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { createLocalVue, mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../data/mock-data';
import VueRouter from 'vue-router';
import RaidenService from '@/services/raiden-service';
import Filters from '@/filters';
import { $identicon } from '../utils/mocks';
import { parseUnits } from 'ethers/utils';
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
  let depositInProgress: jest.SpyInstance;

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
      stubs: ['raiden-dialog'],
      mocks: {
        $raiden: raiden,
        $identicon: $identicon(),
        $t: (msg: string) => msg
      }
    });

    depositInProgress = jest.spyOn(
      wrapper.vm.$data,
      'depositInProgress',
      'set'
    );
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
    beforeEach(() => {
      raiden.closeChannel = jest.fn();
      wrapper.setData({
        selectedChannel: TestData.openChannel
      });
    });

    test('display confirmation dialog when close is pressed', async () => {
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#close-0').trigger('click');

      // @ts-ignore
      expect(wrapper.vm.closing).toBeTruthy();
    });

    test('close is called successfully', async () => {
      // @ts-ignore
      await wrapper.vm.close();
      jest.advanceTimersByTime(2000);

      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(raiden.closeChannel).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner
      );
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.close.success'
      );
    });

    test('emit fail message when close fails', async () => {
      raiden.closeChannel.mockRejectedValue(new Error());

      // @ts-ignore
      await wrapper.vm.close();
      jest.advanceTimersByTime(2000);

      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.close.failure'
      );
    });
  });

  describe('deposit in a channel', () => {
    beforeEach(() => {
      raiden.deposit = jest.fn();
      wrapper.setData({
        selectedChannel: TestData.openChannel
      });
    });

    test('display channel deposit dialog when deposit is pressed', async () => {
      wrapper.find('#channel-278').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#deposit-0').trigger('click');

      // @ts-ignore
      expect(wrapper.vm.depositing).toBeTruthy();
    });

    test('deposit is called successfullt', async () => {
      // @ts-ignore
      await wrapper.vm.deposit('0.5');
      jest.advanceTimersByTime(2000);

      expect(depositInProgress).toHaveBeenNthCalledWith(1, true);
      expect(raiden.deposit).toHaveBeenCalledTimes(1);
      expect(raiden.deposit).toHaveBeenCalledWith(
        TestData.openChannel.token,
        TestData.openChannel.partner,
        '0.5'
      );
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.deposit.success'
      );
    });

    test('emit fail message when deposit fails', async () => {
      raiden.deposit.mockRejectedValue(new Error());

      // @ts-ignore
      await wrapper.vm.deposit('0.5');
      jest.advanceTimersByTime(2000);

      expect(depositInProgress).toHaveBeenNthCalledWith(1, true);
      expect(raiden.deposit).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.deposit.failure'
      );
    });
  });

  describe('settle a channel', () => {
    beforeEach(() => {
      raiden.settleChannel = jest.fn();
      wrapper.setData({
        selectedChannel: TestData.settlableChannel
      });
    });

    test('display confirmation dialog when settle is pressed', async () => {
      wrapper.find('#channel-280').trigger('click');
      await wrapper.vm.$nextTick();
      wrapper.find('#settle-2').trigger('click');

      // @ts-ignore
      expect(wrapper.vm.settling).toBeTruthy();
    });

    test('settle is called successfully', async () => {
      // @ts-ignore
      await wrapper.vm.settle();
      jest.advanceTimersByTime(2000);

      expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
      expect(raiden.settleChannel).toHaveBeenCalledWith(
        TestData.settlableChannel.token,
        TestData.settlableChannel.partner
      );
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.settle.success'
      );
    });

    test('emit fail message when settle fails', async () => {
      raiden.settleChannel.mockRejectedValue(new Error());

      // @ts-ignore
      await wrapper.vm.settle();
      jest.advanceTimersByTime(2000);

      expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted().message[0][0]).toEqual(
        'channel-list.messages.settle.failure'
      );
    });
  });
});
