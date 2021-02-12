import { $identicon } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { utils } from 'ethers';
import Vue from 'vue';
import VueRouter from 'vue-router';
import Vuetify from 'vuetify';
import Vuex, { Store } from 'vuex';

import ChannelList from '@/components/channels/ChannelList.vue';
import Filters from '@/filters';
import type { Token } from '@/model/types';

import { TestData } from '../../data/mock-data';

jest.mock('@/services/raiden-service');
jest.useFakeTimers();

Vue.use(Vuetify);
Vue.use(Vuex);
Vue.use(VueRouter);
Vue.filter('displayFormat', Filters.displayFormat);

describe('ChannelList.vue', () => {
  let wrapper: Wrapper<ChannelList>;
  let vuetify: Vuetify;
  let expanded: { [id: number]: boolean };

  beforeEach(() => {
    expanded = {};
    vuetify = new Vuetify();
    wrapper = mount(ChannelList, {
      vuetify,
      store: new Store({
        state: {
          blockNumber: 2000,
        },
      }),
      propsData: {
        token: {
          address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
          decimals: 10,
          balance: utils.parseUnits('2', 10),
        } as Token,
        channels: TestData.mockChannelArray,
        expanded,
        busy: { undefined: false },
      },
      stubs: ['raiden-dialog'],
      mocks: {
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
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

  test('hide the settle button when a channel is "open"', async () => {
    expect(wrapper.find('#close-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#deposit-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#withdraw-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#settle-278').exists()).toBeFalsy();
  });

  test('disable all buttons when a channel is "closed", settle button has counter', async () => {
    expect(wrapper.find('#close-281').exists()).toBeFalsy();
    expect(wrapper.find('#deposit-281').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#withdraw-281').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-281').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-281').text()).toMatch(/\b251\b/);
  });

  test('enable settle button when a channel is "settleable"', async () => {
    expect(wrapper.find('#close-280').exists()).toBeFalsy();
    expect(wrapper.find('#deposit-280').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#withdraw-280').attributes('disabled')).toBeTruthy();
    expect(wrapper.find('#settle-280').attributes('disabled')).toBeFalsy();
  });

  test('only "selectedChannel" to be busy all other channels enabled', async () => {
    const selectedChannel = TestData.mockChannelArray[1]; // settling channel
    const busy = { [selectedChannel.id]: true };
    wrapper.setProps({ selectedChannel, busy });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#close-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#deposit-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#withdraw-278').attributes('disabled')).toBeFalsy();
    expect(wrapper.find('#settle-280').attributes('disabled')).toBeFalsy();

    // busy button replaces settle button
    expect(wrapper.find('#settle-279').exists()).toBeFalsy();
    expect(wrapper.find('#busy-279').exists()).toBeTruthy();

    // busy false, re-enable buttons only for the "selectedChannel"
    wrapper.setProps({ busy: { [selectedChannel.id]: false } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#settle-279').exists()).toBeTruthy();
    expect(wrapper.find('#busy-279').exists()).toBeFalsy();
    expect(wrapper.find('#close-278').attributes('disabled')).toBeFalsy();
  });

  describe('channel buttons emit events', () => {
    test('emits a close action when close is pressed', async () => {
      wrapper.find('#close-278').trigger('click');
      await wrapper.vm.$nextTick();

      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toEqual(['close', expect.objectContaining({ id: 278 })]);
    });

    test('emits a deposit action when deposit is pressed', async () => {
      wrapper.find('#deposit-278').trigger('click');
      await wrapper.vm.$nextTick();
      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toEqual(['deposit', expect.objectContaining({ id: 278 })]);
    });

    test('emits a withdraw action when withdraw is pressed', async () => {
      wrapper.find('#withdraw-278').trigger('click');
      await wrapper.vm.$nextTick();
      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toEqual(['withdraw', expect.objectContaining({ id: 278 })]);
    });

    test('emits a settle action when settle is pressed', async () => {
      wrapper.find('#settle-280').trigger('click');
      await wrapper.vm.$nextTick();
      const actionEvent = wrapper.emitted('action');
      expect(actionEvent).toBeTruthy();
      const [firstActionArg] = actionEvent?.shift();
      expect(firstActionArg).toEqual(['settle', expect.objectContaining({ id: 280 })]);
    });
  });
});
