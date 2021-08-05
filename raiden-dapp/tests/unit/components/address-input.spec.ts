/* eslint-disable @typescript-eslint/no-explicit-any */
import { $identicon } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { mount } from '@vue/test-utils';
import flushPromises from 'flush-promises';
import Vue from 'vue';
import Vuetify from 'vuetify';

import AddressInput from '@/components/AddressInput.vue';
import store from '@/store/index';

import { mockInput } from '../utils/interaction-utils';

jest.mock('lodash/debounce', () => jest.fn((fn) => fn));
jest.mock('@/services/raiden-service');
jest.useFakeTimers('modern');

Vue.use(Vuetify);

describe('AddressInput', () => {
  let wrapper: Wrapper<AddressInput>;
  let vuetify: Vuetify;

  let ensResolve: jest.Mock<Promise<string>, [string]>;
  let getAvailability: jest.Mock<{ available: boolean }, [string]>;
  const excludeAddress = '0x65E84e07dD79F3f03d72bc0fab664F56E6C55909';
  const onlineTarget = '0x1D36124C90f53d491b6832F1c073F43E2550E35b';
  const offlineTarget = '0x39ff19161414E257AA29461dCD087F6a1AE362Fd';

  function createWrapper(value = '', excluded?: string, hideErrorLabel = false) {
    vuetify = new Vuetify();
    return mount(AddressInput, {
      vuetify,
      store,
      propsData: {
        value,
        hideErrorLabel,
        exclude: excluded ? [excluded] : undefined,
      },
      mocks: {
        $raiden: {
          ensResolve,
          getAvailability,
        },
        $identicon: $identicon(),
        $t: (msg: string) => msg,
      },
    });
  }

  async function flushWrapper(wrapper: ReturnType<typeof createWrapper>) {
    await wrapper.vm.$nextTick();
    jest.runOnlyPendingTimers();
    await flushPromises();
  }

  beforeEach(() => {
    ensResolve = jest.fn().mockResolvedValue(onlineTarget);
    getAvailability = jest.fn().mockResolvedValue(true);
    store.commit('updatePresence', {
      [onlineTarget]: true,
    });
  });

  test('show no validation messages by default', () => {
    wrapper = createWrapper('', excludeAddress);
    const messages = wrapper.find('.v-messages__wrapper');
    expect(wrapper.props().value).toBe('');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('');
  });

  test('set busy flag while fetching an ens domain', async () => {
    wrapper = createWrapper('', excludeAddress);
    const busy = jest.spyOn(wrapper.vm.$data, 'busy', 'set');
    mockInput(wrapper, 'test.eth');
    await flushWrapper(wrapper);
    expect(busy).toHaveBeenCalledTimes(4);
  });

  test('show an error message when the input has an invalid address', async () => {
    wrapper = createWrapper('', excludeAddress);
    mockInput(wrapper, '0x21b');
    await flushWrapper(wrapper);
    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.invalid-address');
  });

  test('show an error message when the input address is not in checksum format', async () => {
    wrapper = createWrapper('', excludeAddress);
    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');
    await flushWrapper(wrapper);
    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.no-checksum');
  });

  test('emits an input error when the input has an invalid address', async () => {
    wrapper = createWrapper('', excludeAddress);
    (wrapper.vm as any).inputError = jest.fn();

    mockInput(wrapper, '0x21b');
    await flushWrapper(wrapper);

    expect((wrapper.vm as any).inputError).toHaveBeenCalledWith(
      expect.stringContaining('invalid-address'),
    );
  });

  test('emits an input error when the input address is not in checksum format', async () => {
    wrapper = createWrapper('', excludeAddress);
    (wrapper.vm as any).inputError = jest.fn();

    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');
    await flushWrapper(wrapper);

    expect((wrapper.vm as any).inputError).toHaveBeenCalledWith(
      expect.stringContaining('no-checksum'),
    );
  });

  test('fire an input event when the input address is valid', async () => {
    wrapper = createWrapper('', excludeAddress);
    mockInput(wrapper, onlineTarget);
    await flushWrapper(wrapper);

    const inputEvent = wrapper.emitted('input');
    expect(inputEvent).toBeTruthy();
    expect(inputEvent).toContainEqual([onlineTarget]);
  });

  test('can hide error label', async () => {
    wrapper = createWrapper('', excludeAddress, true);
    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');

    await flushWrapper(wrapper);
    const messages = wrapper.find('.v-messages__message');

    expect(messages.exists()).toBe(false);
  });

  test('render a blockie when the input address is valid', async () => {
    wrapper = createWrapper(onlineTarget, excludeAddress);
    await flushWrapper(wrapper);
    expect(wrapper.vm.$identicon.getIdenticon).toHaveBeenCalled();
  });

  test('click on QR code opens overlay', async () => {
    wrapper = createWrapper('', excludeAddress);
    expect(wrapper.vm.$data.isQrCodeOverlayVisible).toBe(false);

    wrapper.find('.address-input__qr-code svg').trigger('click');
    await flushWrapper(wrapper);

    expect(wrapper.vm.$data.isQrCodeOverlayVisible).toBe(true);
  });

  test('insert address if QR code got decoded', async () => {
    wrapper = createWrapper('', excludeAddress);
    (wrapper.vm as any).onDecode(onlineTarget);

    await flushWrapper(wrapper);
    const inputEvent = wrapper.emitted('input');
    expect(inputEvent).toBeTruthy();
    expect(inputEvent).toContainEqual([onlineTarget]);
  });

  describe('resolve an ens domain', () => {
    test('with success', async () => {
      wrapper = createWrapper('', excludeAddress);
      mockInput(wrapper, 'ens');
      await flushWrapper(wrapper);
      mockInput(wrapper, 'enstest');
      await flushWrapper(wrapper);
      mockInput(wrapper, 'enstest.test');
      await flushWrapper(wrapper);

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual([onlineTarget]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(0);
    });

    test('without success', async () => {
      ensResolve.mockResolvedValue('');
      wrapper = createWrapper('', excludeAddress);

      mockInput(wrapper, 'enstest.test');
      await flushWrapper(wrapper);

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual(['']);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain('address-input.error.ens-resolve-failed');
    });

    test('with an error', async () => {
      ensResolve.mockRejectedValue(new Error('something went wrong'));
      wrapper = createWrapper('', excludeAddress);

      mockInput(wrapper, 'enstest.test');
      await flushWrapper(wrapper);

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual(['enstest.test']);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain('address-input.error.ens-resolve-failed');
    });
  });

  describe('exclude addresses', () => {
    test('should show error message when the user enters an invalid or excluded address', async () => {
      wrapper = createWrapper('', excludeAddress);
      mockInput(wrapper, excludeAddress);
      await flushWrapper(wrapper);

      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toBe('address-input.error.invalid-excluded-address');
    });
  });

  describe('update model on value changes', () => {
    test('do not update the model on an invalid value', () => {
      wrapper = createWrapper('0xsdajlskdj');
      expect(wrapper.vm.$data.address).toBe('');
    });

    test('update the model on a valid value', () => {
      wrapper = createWrapper(onlineTarget);
      expect(wrapper.vm.$data.address).toBe(onlineTarget);
    });

    test('update the address on a valid value', async () => {
      wrapper = createWrapper(onlineTarget);
      expect(wrapper.vm.$data.address).toBe(onlineTarget);
    });

    test('do not update the address on an invalid value', async () => {
      wrapper = createWrapper();
      expect(wrapper.vm.$data.address).toBe('');
      wrapper.setProps({ value: '0x1aaaaaadshjd' });
      await flushWrapper(wrapper);
      expect(wrapper.vm.$data.address).toBe('');
    });
  });

  describe('target availability', () => {
    test('show target as online', async () => {
      getAvailability = jest.fn().mockResolvedValue(true);
      wrapper = createWrapper(onlineTarget);
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--online').exists()).toBeTruthy();
    });

    test('show target as offline', async () => {
      getAvailability = jest.fn().mockResolvedValue(false);
      wrapper = createWrapper(offlineTarget);
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--offline').exists()).toBeTruthy();
    });

    test('show target as offline when presence is not in state yet', async () => {
      store.commit('reset');
      getAvailability = jest.fn().mockImplementation(async () => {
        store.commit('updatePresence', { [offlineTarget]: false });
        return false;
      });
      wrapper = createWrapper(offlineTarget);
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--offline').exists()).toBeTruthy();
    });

    test('show target as online when presence is not in state yet', async () => {
      store.commit('reset');
      getAvailability = jest.fn().mockImplementation(async () => {
        store.commit('updatePresence', { [onlineTarget]: true });
        return true;
      });
      wrapper = createWrapper(onlineTarget);
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--online').exists()).toBeTruthy();
    });

    test('input reacts to target going offline', async () => {
      store.commit('updatePresence', { [onlineTarget]: true });
      wrapper = createWrapper(onlineTarget);
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--online').exists()).toBeTruthy();
      store.commit('updatePresence', { [onlineTarget]: false });
      await flushWrapper(wrapper);
      expect(wrapper.find('.address-input__availability--online').exists()).toBeFalsy();
    });
  });
});
