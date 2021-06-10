import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import Vue from 'vue';
import Vuetify from 'vuetify';

import TextInputWithToggle from '@/components/TextInputWithToggle.vue';

Vue.use(Vuetify);

const vuetify = new Vuetify();

function createWrapper(options?: {
  value?: string;
  name?: string;
  details?: string;
  placeholder?: string;
  optional?: boolean;
}): Wrapper<TextInputWithToggle> {
  return mount(TextInputWithToggle, {
    vuetify,
    propsData: {
      value: options?.value ?? '',
      name: options?.name ?? 'testName',
      details: options?.details ?? 'testDetails',
      placeholder: options?.placeholder,
      optional: options?.optional,
    },
  });
}

describe('TextInputWithToggle.vue', () => {
  test('displays setting its name', () => {
    const wrapper = createWrapper({ name: 'test setting name' });
    const name = wrapper.find('h3');

    expect(name.exists()).toBeTruthy();
    expect(name.text()).toMatch('test setting name');
  });

  test('displays settings details text', () => {
    const wrapper = createWrapper({ details: 'some details' });
    const details = wrapper.find('span');

    expect(details.exists()).toBeTruthy();
    expect(details.text()).toMatch('some details');
  });

  test('uses optional placeholder text', () => {
    const wrapper = createWrapper({ placeholder: 'input placeholder' });
    const input = wrapper.get('.text-input-with-toggle__input');

    expect(input.attributes('placeholder')).toMatch('input placeholder');
  });

  test('non optional settings are always enabled', () => {
    const wrapper = createWrapper({ optional: false });
    const input = wrapper.get('.text-input-with-toggle__input');

    expect(input.attributes('disabled')).toBeFalsy();
  });

  test('optional settings are enabled per default', () => {
    const wrapper = createWrapper({ optional: true });
    const input = wrapper.get('.text-input-with-toggle__input');

    expect(input.attributes('disabled')).toBeTruthy();
  });

  test('can toggle optional settings input field', async () => {
    const wrapper = createWrapper({ optional: true });
    const toggle = wrapper.get('.text-input-with-toggle__toggle').find('input');
    const input = wrapper.get('.text-input-with-toggle__input');
    expect(input.attributes('disabled')).toBeTruthy();

    toggle.trigger('click');
    await wrapper.vm.$nextTick();

    expect(input.attributes('disabled')).toBeFalsy();
  });

  test('optional settings with initial value get enabled automatically', () => {
    const wrapper = createWrapper({ value: 'initial value', optional: true });
    const input = wrapper.get('.text-input-with-toggle__input');

    expect(input.attributes('disabled')).toBeFalsy();
  });

  test('emits input event on value change', async () => {
    const wrapper = createWrapper({ value: 'initial value', optional: true });
    const input = wrapper.get('.text-input-with-toggle__input');

    (input.element as HTMLInputElement).value = 'typed text';
    input.trigger('input');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('input')?.length).toBe(1);
  });
});
