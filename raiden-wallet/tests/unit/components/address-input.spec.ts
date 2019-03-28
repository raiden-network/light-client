import { mount, Wrapper } from '@vue/test-utils';
import AddressInput from '@/components/AddressInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';

Vue.use(Vuetify);

describe('AddressInput', function() {
  let wrapper: Wrapper<AddressInput>;

  beforeEach(() => {
    wrapper = mount(AddressInput, {
      propsData: {
        value: ''
      }
    });
  });

  it('should show no validation messages', () => {
    const messages = wrapper.find('.v-messages__message');
    expect(wrapper.props().value).toBe('');
    expect(messages.exists()).toBe(false);
  });

  it('should show a this address cannot be an empty message', async () => {
    mockInput(wrapper, '0x21b');
    await wrapper.vm.$nextTick();
    mockInput(wrapper);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().input).toBeTruthy();
    expect(wrapper.emitted().input[0]).toEqual(['0x21b']);
    expect(wrapper.emitted().input[1]).toEqual(['']);

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('The address cannot be empty');
  });

  it('should should show a no valid address message', async () => {
    mockInput(wrapper, '0x21b');
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('A valid address is required');
  });

  it('should should show a not checksum format message if address not in checksum format', async () => {
    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe(
      'Address 0x774afb0652ca2c711fd13e6e9d51620568f6ca82 is not in checksum format'
    );
  });
});
