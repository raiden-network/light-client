jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import Vue from 'vue';
import Vuex from 'vuex';
import Vuetify from 'vuetify';
import { mount, Wrapper } from '@vue/test-utils';
import { TestData } from '../../data/mock-data';
import VueRouter from 'vue-router';
import Filters from '@/filters';
import { $identicon } from '../../utils/mocks';
import { parseUnits } from 'ethers/utils';
import ChannelList from '@/components/channels/ChannelList.vue';
import { Token } from '@/model/types';

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);
Vue.filter('displayFormat', Filters.displayFormat);

describe('ChannelList.vue', () => {
  let wrapper: Wrapper<ChannelList>;
  let vuetify: typeof Vuetify;
  let expanded: { [id: number]: boolean };

  beforeEach(() => {
    expanded = {};
    vuetify = new Vuetify();
    wrapper = mount(ChannelList, {
      vuetify,
      propsData: {
        token: {
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 10,
          balance: parseUnits('2', 10)
        } as Token,
        channels: TestData.mockChannelArray,
        expanded
      },
      stubs: ['raiden-dialog'],
      mocks: {
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

  describe('channel buttons emit events', () => {
    test('emits a close action when close is pressed', async () => {
      wrapper.find('#channel-278').trigger('click');

      await wrapper.vm.$nextTick();
      const expandEvent = wrapper.emitted('expand');
      expect(expandEvent).toBeTruthy();
      const [firstExpansionArg] = expandEvent?.shift();
      expect(firstExpansionArg).toMatchObject({
        channel: TestData.openChannel,
        expanded: true
      });

      wrapper.find('#close-0').trigger('click');
      await wrapper.vm.$nextTick();

      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toBe('close');
    });

    test('emits a deposit action when deposit is pressed', async () => {
      wrapper.find('#channel-278').trigger('click');

      await wrapper.vm.$nextTick();
      const expandEvent = wrapper.emitted('expand');
      expect(expandEvent).toBeTruthy();
      const [firstExpansionArg] = expandEvent?.shift();
      expect(firstExpansionArg).toMatchObject({
        channel: TestData.openChannel,
        expanded: true
      });
      wrapper.find('#deposit-0').trigger('click');
      await wrapper.vm.$nextTick();
      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toBe('deposit');
    });

    test('emits a settle action when settle is pressed', async () => {
      wrapper.find('#channel-280').trigger('click');

      await wrapper.vm.$nextTick();
      const expandEvent = wrapper.emitted('expand');
      expect(expandEvent).toBeTruthy();
      const [firstExpansionArg] = expandEvent?.shift();
      expect(firstExpansionArg).toMatchObject({
        channel: TestData.settlableChannel,
        expanded: true
      });
      wrapper.find('#settle-2').trigger('click');
      await wrapper.vm.$nextTick();
      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toBe('settle');
    });
  });
});
