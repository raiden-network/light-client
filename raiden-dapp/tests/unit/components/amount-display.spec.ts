import { mount, Wrapper } from '@vue/test-utils';
import Vue from 'vue';
import Filters from '@/filters';
import { One } from 'ethers/constants';
import { Token } from '@/model/types';
import AmountDisplay from '@/components/AmountDisplay.vue';

Vue.filter('displayFormat', Filters.displayFormat);

describe('AmountDisplay.vue', () => {
  let wrapper: Wrapper<AmountDisplay>;

  const token: Token = {
    address: '0xtoken',
    balance: One,
    decimals: 18,
    symbol: 'TTT',
    name: 'Test Token'
  };

  const createWrapper = (exactAmount: boolean) => {
    return mount(AmountDisplay, {
      propsData: {
        exactAmount: exactAmount,
        amount: token.balance,
        token: token
      }
    });
  };

  test('does not display full amount when "exactAmount" prop is set to false', () => {
    wrapper = createWrapper(false);
    const amountDisplay = wrapper.find('div');
    amountDisplay.trigger('mouseover');

    expect(amountDisplay.text()).toContain('<0.000001');
  });

  test('does display full amount when "exactAmount" prop is set to true', async () => {
    wrapper = createWrapper(true);
    const amountDisplay = wrapper.find('div');
    amountDisplay.trigger('mouseover');
    await wrapper.vm.$nextTick();

    expect(amountDisplay.text()).toContain('0.000000000000000001');
  });

  test('toggles between displaying full amount and not displaying full amount', async () => {
    wrapper = createWrapper(true);
    const amountDisplay = wrapper.find('div');
    amountDisplay.trigger('mouseover');
    await wrapper.vm.$nextTick();

    expect(amountDisplay.text()).toContain('0.000000000000000001');

    amountDisplay.trigger('mouseleave');
    await wrapper.vm.$nextTick();

    expect(amountDisplay.text()).toContain('<0.000001');
  });
});
