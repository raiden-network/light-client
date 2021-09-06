/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import { BigNumber } from 'ethers';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import AmountInput from '@/components/AmountInput.vue';

import { TestData } from '../data/mock-data';
import { generateToken } from '../utils/data-generator';
import { mockInput } from '../utils/interaction-utils';

Vue.use(Vuetify);

const tokenWithZeroDecimals = generateToken({ decimals: 0 });
const tokenWithMultiDecimals = generateToken({ decimals: 18 });

describe('AmountInput.vue', () => {
  let wrapper: Wrapper<AmountInput>;
  let vuetify: Vuetify;

  function createWrapper(params: Record<string, unknown>): Wrapper<AmountInput> {
    vuetify = new Vuetify();
    return mount(AmountInput, {
      vuetify,
      propsData: {
        label: 'Has Label',
        token: TestData.token,
        value: '0.00',
        ...params,
      },
      mocks: {
        $t: (msg: string) => msg,
      },
      listeners: {
        input: ($event: string) => {
          wrapper.setProps({ value: $event });
        },
      },
    });
  }

  describe('unlimited', () => {
    beforeEach(async () => {
      wrapper = createWrapper({ limit: false });
      await wrapper.vm.$nextTick();
    });

    test('show no validation messages by default', () => {
      const messages = wrapper.find('.v-messages__message');
      expect(wrapper.props().value).toEqual('0.00');
      expect(messages.exists()).toBe(false);
    });

    test('show no error if the input is valid', async () => {
      mockInput(wrapper, '1.2');
      await wrapper.vm.$nextTick();
      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent?.shift()).toEqual(['1.2']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(false);
    });
  });

  describe('limited', () => {
    beforeEach(async () => {
      wrapper = createWrapper({ limit: true, min: BigNumber.from(100000), value: '0.00' });
      await wrapper.vm.$nextTick();
    });

    test('show an error if the amount is smaller than the limit', async () => {
      mockInput(wrapper, '2.4');
      await wrapper.vm.$nextTick();
      await flushPromises();
      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent?.shift()).toEqual(['2.4']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.not-enough-funds');
    });

    test('show an error if the amount has more decimals than supported', async () => {
      mockInput(wrapper, '1.42345678');
      await wrapper.vm.$nextTick();
      await flushPromises();
      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent?.shift()).toEqual(['1.42345678']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.too-many-decimals');
    });

    test('show an error if the amount is less than the minimum', async () => {
      mockInput(wrapper, '0.5');
      await wrapper.vm.$nextTick();
      await flushPromises();
      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent?.shift()).toEqual(['0.5']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.less-than-minimum');
    });

    test('call preventDefault when pasting an invalid value', () => {
      const event = {
        clipboardData: {
          getData: jest.fn().mockReturnValue('invalid'),
        },
        preventDefault: jest.fn().mockReturnValue(null),
      };
      (wrapper.vm as any).onPaste(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('select the previous value when pasting a valid value', () => {
      const event = {
        clipboardData: {
          getData: jest.fn().mockReturnValue('1.2'),
        },
        target: {
          value: '1.2',
          setSelectionRange: jest.fn().mockReturnValue(null),
        },
        preventDefault: jest.fn().mockReturnValue(null),
      };
      (wrapper.vm as any).onPaste(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(0);
      expect(event.target.setSelectionRange).toHaveBeenCalledTimes(1);
      expect(event.target.setSelectionRange).toBeCalledWith(0, 3);
    });
  });

  describe('update model on value changes', () => {
    test('do not update the model on an invalid value', () => {
      wrapper = createWrapper({ value: '1.41asjdhlk' });
      expect(wrapper.vm.$data.amount).toBe('');
    });

    test('update the model on a valid value', () => {
      wrapper = createWrapper({ value: '1.2' });
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    /**
     *  TODO: there are some bugs with immediate watchers and vue-test-utils
     *  https://github.com/vuejs/vue-test-utils/issues/1419
     *  skip test and keep track of the issue and vue-test-utils updates
     */
    test.skip('update the amount on a valid value', async () => {
      wrapper = createWrapper({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2' });
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    test('do not update the amount on an invalid value', async () => {
      wrapper = createWrapper({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2asddswad' });
      expect(wrapper.vm.$data.amount).toBe('');
    });
  });

  describe('adapt zero input values to decimals', () => {
    test('changes zero decimal to multi decimal if input is zero', async () => {
      wrapper = createWrapper({ value: '0', token: tokenWithZeroDecimals });

      wrapper.setProps({ token: tokenWithMultiDecimals });
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.$data.amount).toBe('0.00');
    });

    test('changes multi decimal to zero decimal if input is zero', async () => {
      wrapper = createWrapper({ value: '0.00', token: tokenWithMultiDecimals });

      wrapper.setProps({ token: tokenWithZeroDecimals });
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.$data.amount).toBe('0');
    });

    test('does nothing if the input is not zero', async () => {
      wrapper = createWrapper({ value: '2.1', token: tokenWithZeroDecimals });

      wrapper.setProps({ token: tokenWithMultiDecimals });
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.$data.amount).toBe('2.1');
    });
  });
});
