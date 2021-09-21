import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import Vue from 'vue';

import AmountDisplay from '@/components/AmountDisplay.vue';
import Filters from '@/filters';
import type { Token } from '@/model/types';

import { generateToken } from '../utils/data-generator';

Vue.filter('displayFormat', Filters.displayFormat);

const token = generateToken({ balance: constants.One });

function createWrapper(options?: {
  token?: Token;
  amount?: BigNumber;
  exactAmount?: boolean;
  sign?: string;
  label?: string;
  slot?: string;
}): Wrapper<AmountDisplay> {
  return mount(AmountDisplay, {
    propsData: {
      token: options?.token ?? token,
      amount: options?.amount ?? constants.One,
      exactAmount: options?.exactAmount,
      sign: options?.sign,
      label: options?.label,
    },
    slots: { default: options?.slot ?? '' },
  });
}

async function triggerHoverEvent(
  wrapper: Wrapper<AmountDisplay>,
  eventName = 'mouseover',
): Promise<void> {
  wrapper.trigger(eventName);
  await wrapper.vm.$nextTick();
}

describe('AmountDisplay.vue', () => {
  test('does not display full amount when "exactAmount" prop is set to false', async () => {
    const token = generateToken({ decimals: 7 });
    const wrapper = createWrapper({ exactAmount: false, token, amount: constants.One });
    const formattedAmount = wrapper.get('.amount-display__formatted-amount');

    await triggerHoverEvent(wrapper);

    expect(formattedAmount.text()).toContain('<0.000001');
  });

  test('does display full amount when "exactAmount" prop is set to true', async () => {
    const token = generateToken({ decimals: 7 });
    const wrapper = createWrapper({ exactAmount: true, token, amount: constants.One });
    const formattedAmount = wrapper.get('.amount-display__formatted-amount');

    await triggerHoverEvent(wrapper);

    expect(formattedAmount.text()).toContain('0.0000001');
  });

  test('toggles between displaying full amount and not displaying full amount', async () => {
    const token = generateToken({ decimals: 7 });
    const wrapper = createWrapper({ exactAmount: true, token, amount: constants.One });
    const formattedAmount = wrapper.get('.amount-display__formatted-amount');

    await triggerHoverEvent(wrapper, 'mouseover');

    expect(formattedAmount.text()).toContain('0.0000001');

    await triggerHoverEvent(wrapper, 'mouseleave');

    expect(formattedAmount.text()).toContain('<0.000001');
  });

  test('displays sign if propery is set', () => {
    const wrapper = createWrapper({ sign: '+' });
    const formattedAmount = wrapper.get('.amount-display__formatted-amount');

    expect(formattedAmount.text()).toContain('+');
  });

  test('displays label if propery is set', () => {
    const wrapper = createWrapper({ label: 'test label' });
    const label = wrapper.find('.amount-display__label');

    expect(label.exists()).toBeTruthy();
    expect(label.text()).toBe('test label');
  });

  test('displays also an empty label if propery is set', () => {
    const wrapper = createWrapper({ label: '' });
    const label = wrapper.find('.amount-display__label');

    expect(label.exists()).toBeTruthy();
    expect(label.text()).toBe('');
  });

  test('displays slot instead of amount if defined', () => {
    const wrapper = createWrapper({ slot: "<span id='test'>test</span>" });
    const slot = wrapper.find('#test');
    const formattedAmount = wrapper.find('.amount-display__formatted-amount');

    expect(slot.exists()).toBeTruthy();
    expect(formattedAmount.exists()).toBeFalsy();
  });
});
