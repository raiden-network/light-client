import { mount, Wrapper } from '@vue/test-utils';
import AmountInput from '@/components/AmountInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';
import { TestData } from '../data/mock-data';

Vue.use(Vuetify);

describe('AmountInput.vue', function() {
  let wrapper: Wrapper<AmountInput>;

  describe('unlimited', function() {
    beforeEach(() => {
      wrapper = mount(AmountInput, {
        propsData: {
          label: 'Has Label',
          token: TestData.token
        },
        mocks: {
          $t: (msg: string) => msg
        }
      });
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
      wrapper = mount(AmountInput, {
        propsData: {
          label: 'Has Label',
          limit: true,
          token: TestData.token
        },
        mocks: {
          $t: (msg: string) => msg
        }
      });
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

    it('should not emit an event if the input is not a valid number', async function() {
      mockInput(wrapper, '1.4');
      await wrapper.vm.$nextTick();

      mockInput(wrapper, '1.4a');
      await wrapper.vm.$nextTick();

      const inputEvent = wrapper.emitted().input;
      expect(inputEvent).toBeTruthy();
      expect(inputEvent.length).toBe(1);
      expect(inputEvent[0]).toEqual(['1.4']);
    });
  });
});
