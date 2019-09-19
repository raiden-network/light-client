import { mount, Wrapper } from '@vue/test-utils';
import AmountInput from '@/components/AmountInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';
import { TestData } from '../data/mock-data';

Vue.use(Vuetify);

describe('AmountInput.vue', function() {
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

  describe('unlimited', function() {
    beforeEach(() => {
      wrapper = vueFactory({ limit: false });
    });

    it('should show no validation messages', () => {
      const messages = wrapper.find('.v-messages__message');
      expect(wrapper.props().value).toEqual('0.00');
      expect(messages.exists()).toBe(false);
    });

    it('should show an amount cannot be empty message', async function() {
      mockInput(wrapper, '');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.empty');
    });

    it('should show no error if a valid amount is added', async function() {
      mockInput(wrapper, '1.2');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['1.2']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(false);
    });
  });

  describe('limited', function() {
    beforeEach(() => {
      wrapper = vueFactory({ limit: true, value: '' });
    });

    it('should display an error if the amount is smaller than the limit', async function() {
      mockInput(wrapper, '2.4');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['2.4']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.not-enough-funds');
    });

    it('should display an error if the amount has more decimals than supported', async function() {
      mockInput(wrapper, '1.42345678');
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual(['1.42345678']);
      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toEqual('amount-input.error.too-many-decimals');
    });

    test('should not prevent keypress if allowed', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: '1',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(0);
    });

    test('should prevent keypress if the key is not a number', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: 'a',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('should prevent keypress if the input is empty and the key is a dot', () => {
      wrapper.find('input').setValue('');
      const event = {
        key: '.',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('should prevent keypress if the input is contains a dot and the key is a dot', () => {
      wrapper.find('input').setValue('1.');
      const event = {
        key: '.',
        preventDefault: jest.fn().mockReturnValue(null)
      };
      // @ts-ignore
      wrapper.vm.checkIfValid(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    test('pasting invalid value should preventDefault', () => {
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

    test('pasting a valid value should select the previous value', () => {
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

  describe('internal value should react to model changes', () => {
    test('invalid value should not update internal amount', () => {
      wrapper = vueFactory({ value: '1.41asjdhlk' });
      expect(wrapper.vm.$data.amount).toBe('');
    });

    test('valid value should update internal amount', () => {
      wrapper = vueFactory({ value: '1.2' });
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    test('amount should be updated on valid changes', async () => {
      wrapper = vueFactory({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2' });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.amount).toBe('1.2');
    });

    test('amount should not update on invalid changes', async () => {
      wrapper = vueFactory({ value: '' });
      expect(wrapper.vm.$data.amount).toBe('');
      wrapper.setProps({ value: '1.2asddasd' });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.amount).toBe('');
    });
  });
});
