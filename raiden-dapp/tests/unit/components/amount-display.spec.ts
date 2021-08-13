import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { constants } from 'ethers';
import Vue from 'vue';

import AmountDisplay from '@/components/AmountDisplay.vue';
import Filters from '@/filters';

import { generateToken } from '../utils/data-generator';

Vue.filter('displayFormat', Filters.displayFormat);

const token = generateToken({ balance: constants.One });

function createWrapper(options?: {
  exactAmount?: boolean;
  sign?: string;
  label?: string;
}): Wrapper<AmountDisplay> {
  return mount(AmountDisplay, {
    propsData: {
      token: token,
      amount: token.balance,
      exactAmount: options?.exactAmount,
      sign: options?.sign,
      label: options?.label,
    },
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
    const wrapper = createWrapper({ exactAmount: false });

    await triggerHoverEvent(wrapper);

    expect(wrapper.text()).toContain('<0.000001');
  });

  test('does display full amount when "exactAmount" prop is set to true', async () => {
    const wrapper = createWrapper({ exactAmount: true });

    await triggerHoverEvent(wrapper);

    expect(wrapper.text()).toContain('0.000000000000000001');
  });

  test('toggles between displaying full amount and not displaying full amount', async () => {
    const wrapper = createWrapper({ exactAmount: true });

    await triggerHoverEvent(wrapper, 'mouseover');

    expect(wrapper.text()).toContain('0.000000000000000001');

    await triggerHoverEvent(wrapper, 'mouseleave');

    expect(wrapper.text()).toContain('<0.000001');
  });

  test('displays sign if propery is set', () => {
    const wrapper = createWrapper({ sign: '+' });

    expect(wrapper.text()).toContain('+');
  });

  test('displays label if propery is set', () => {
    const wrapper = createWrapper({ label: 'test label' });

    expect(wrapper.text()).toContain('test label');
  });
});
