import { mount, Wrapper } from '@vue/test-utils';
import AmountInput from '@/components/AmountInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';
import { TestData } from '../data/mock-data';
import flushPromises from 'flush-promises';

Vue.use(Vuetify);

describe('AmountInput.vue', () => {
  let wrapper: Wrapper<AmountInput>;

  const vueFactory = (params: {}): Wrapper<AmountInput> =>
    mount(AmountInput, {
      propsData: {
        label: 'Has Label',
        token: TestData.token,
        ...params
      },
      mocks: {
        $t: (msg: string) => msg
      }
    });

  describe('unlimited', () => {
    beforeEach(async () => {
      wrapper = vueFactory({ limit: false });
      await wrapper.vm.$nextTick();
    });

    test('show no validation messages by default', () => {
      const messages = wrapper.find('.v-messages__message');
      expect(wrapper.props().value).toEqual('0.00');
      expect(messages.exists()).toBe(false);
    });

    test('show an error message when the input is empty', async () => {
      mockInput(wrapper, '');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.empty');
    });

    test('show no error if the input is valid', async () => {
      mockInput(wrapper, '1.2');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['1.2']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(false);
    });
  });

  describe('limited', () => {
    beforeEach(() => {
      wrapper = vueFactory({ limit: true, value: '' });
    });

    test('show an error if the amount is smaller than the limit', async () => {
      mockInput(wrapper, '2.4');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['2.4']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.not-enough-funds');
    });

    test('show an error if the amount has more decimals than supported', async () => {
      mockInput(wrapper, '1.42345678');
      await wrapper.vm.$nextTick();
      await flushPromises();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['1.42345678']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.too-many-decimals');
    });

    test('do not prevent the keypress for an allowed key', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: '1',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(0);
    });

    test('prevent the keypress for a non-numeric key', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: 'a',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('prevent the keypress for a dot when the input is empty', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: '.',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('prevent the keypress for a dot when a dot already exists', () => {
      wrapper.find('input').setValue('1.');
      const event = {
        key: '.',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('call preventDefault when pasting an invalid value', () => {
      const event = {
        clipboardData: {
          getData: jest.fn().mockReturnValue('invalid')
        },
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.onPaste(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('select the previous value when pasting a valid value', () => {
      const event = {
        clipboardData: {
          getData: jest.fn().mockReturnValue('1.2')
        },
        target: {
          value: '1.2',
          setSelectionRange: jest.fn().mockReturnValue(null)
        },
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.onPaste(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(0);
      expect(event.target.setSelectionRange).toHaveBeenCalledTimes(1);
      expect(event.target.setSelectionRange).toBeCalledWith(0, 3);
    });
  });

  describe('update model on value changes', () => {
    test('do not update the model on an invalid value', () => {
      wrapper = vueFactory({ value: '1.41asjdhlk' });
      expect(wrapper.vm.$data.amount).toBe('');
    });

    test('update the model on a valid value', () => {
      wrapper = vueFactory({ value: '1.2' });
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    test('update the amount on a valid value', async () => {
      wrapper = vueFactory({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2' });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    test('do not update the amount on an invalid value', async () => {
      wrapper = vueFactory({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2asddasd' });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.amount).toBe('');
    });
  });
});
