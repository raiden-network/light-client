jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import flushPromises from 'flush-promises';
import { $identicon } from '../utils/mocks';
import store from '@/store/index';
import { mount, Wrapper } from '@vue/test-utils';
import AddressInput from '@/components/AddressInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';

Vue.use(Vuetify);

describe('AddressInput', () => {
  let wrapper: Wrapper<AddressInput>;
  let vuetify: typeof Vuetify;

  let ensResolve: jest.Mock<any, any>;
  let getAvailability: jest.Mock<any, any>;
  const excludeAddress: string = '0x65E84e07dD79F3f03d72bc0fab664F56E6C55909';
  const blockAddress: string = '0xaCdCAC1e966D1D00baBf2d0E947520cF65fD0516';
  const onlineTarget: string = '0x1D36124C90f53d491b6832F1c073F43E2550E35b';
  const offlineTarget: string = '0x39ff19161414E257AA29461dCD087F6a1AE362Fd';

  function createWrapper(
    value: string = '',
    excluded?: string,
    blocked?: string
  ) {
    vuetify = new Vuetify();
    return mount(AddressInput, {
      vuetify,
      store,
      propsData: {
        value,
        exclude: excluded ? [excluded] : undefined,
        block: blocked ? [blocked] : undefined,
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

  beforeEach(() => {
    ensResolve = jest.fn().mockResolvedValue(onlineTarget);
    getAvailability = jest.fn().mockResolvedValue(true);
    store.commit('updatePresence', {
      [onlineTarget]: true,
    });
  });

  test('show no validation messages by default', () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    const messages = wrapper.find('.v-messages__wrapper');
    expect(wrapper.props().value).toBe('');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('');
  });

  test('set busy flag while fetching an ens domain', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    mockInput(wrapper, 'test.eth');
    const busy = jest.spyOn(wrapper.vm.$data, 'busy', 'set');
    await wrapper.vm.$nextTick();
    jest.runAllTimers();
    await flushPromises();
    expect(busy).toHaveBeenCalledTimes(4);
  });

  test('show an empty address message when the input is empty', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    mockInput(wrapper, '0x21b');
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    mockInput(wrapper);
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();

    const inputEvent = wrapper.emitted('input');
    expect(inputEvent).toBeDefined();
    expect(inputEvent?.shift()).toEqual(['0x21b']);
    expect(inputEvent?.shift()).toEqual(['']);

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.empty');
  });

  test('show an error message when the input has an invalid address', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    mockInput(wrapper, '0x21b');
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.invalid-address');
  });

  test('show an error message when the input address is not in checksum format', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.no-checksum');
  });

  test('fire an input event when the input address is valid', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    mockInput(wrapper, onlineTarget);
    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();

    const inputEvent = wrapper.emitted('input');
    expect(inputEvent).toBeTruthy();
    expect(inputEvent).toContainEqual([onlineTarget]);
  });

  test('render a blockie when the input address is valid', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    wrapper.setProps({ value: onlineTarget });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.$identicon.getIdenticon).toHaveBeenCalled();
  });

  test('click on QR code opens overlay', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    expect(wrapper.vm.$data.isQrCodeOverlayVisible).toBe(false);

    wrapper.find('.address-input__qr-code svg').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.$data.isQrCodeOverlayVisible).toBe(true);
  });

  test('insert address if QR code got decoded', async () => {
    wrapper = createWrapper('', excludeAddress, blockAddress);
    // @ts-ignore
    wrapper.vm.onDecode(onlineTarget);

    jest.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();

    const inputEvent = wrapper.emitted('input');
    expect(inputEvent).toBeTruthy();
    expect(inputEvent).toContainEqual([onlineTarget]);
  });

  describe('resolve an ens domain', () => {
    test('with success', async () => {
      wrapper = createWrapper('', excludeAddress, blockAddress);
      mockInput(wrapper, 'ens');
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      mockInput(wrapper, 'enstest');
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      mockInput(wrapper, 'enstest.test');
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual([onlineTarget]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(0);
    });

    test('without success', async () => {
      ensResolve = jest.fn().mockResolvedValue(null);
      wrapper = createWrapper('', excludeAddress, blockAddress);

      mockInput(wrapper, 'enstest.test');
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual([null]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain(
        'address-input.error.ens-resolve-failed'
      );
    });

    test('with an error', async () => {
      ensResolve = jest.fn().mockRejectedValue(Error('something went wrong'));
      wrapper = createWrapper('', excludeAddress, blockAddress);

      mockInput(wrapper, 'enstest.test');
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const inputEvent = wrapper.emitted('input');
      expect(inputEvent).toBeTruthy();
      expect(inputEvent).toContainEqual(['enstest.test']);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain(
        'address-input.error.ens-resolve-failed'
      );
    });
  });

  describe('exclude & block addresses', () => {
    test('should show error message when the user enters an invalid or excluded address', async () => {
      wrapper = createWrapper('', excludeAddress, blockAddress);
      mockInput(wrapper, excludeAddress);
      await wrapper.vm.$nextTick();
      jest.runAllTimers();
      await flushPromises();

      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toBe(
        'address-input.error.invalid-excluded-address'
      );
    });

    test('show an error message if the input has a blocked address', async () => {
      wrapper = createWrapper('', excludeAddress, blockAddress);
      mockInput(wrapper, blockAddress);
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();

      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toBe('address-input.error.channel-not-open');
    });

    test('show not an error message if there is no exclude or block prop', async () => {
      wrapper = createWrapper('');

      mockInput(wrapper, onlineTarget);
      await wrapper.vm.$nextTick();

      const messages = wrapper.find('.v-messages__wrapper');
      expect(messages.text()).toEqual('');
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
      wrapper = createWrapper();
      expect(wrapper.vm.$data.address).toBe('');
      wrapper.setProps({ value: onlineTarget });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.address).toBe(onlineTarget);
    });

    test('do not update the address on an invalid value', async () => {
      wrapper = createWrapper();
      expect(wrapper.vm.$data.address).toBe('');
      wrapper.setProps({ value: '0x1aaaaaadshjd' });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.$data.address).toBe('');
    });
  });

  describe('target availability', () => {
    test('show target as online', async () => {
      getAvailability = jest.fn().mockResolvedValue(true);
      wrapper = createWrapper(onlineTarget);
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--online').exists()
      ).toBeTruthy();
    });

    test('show target as offline', async () => {
      getAvailability = jest.fn().mockResolvedValue(false);
      wrapper = createWrapper(offlineTarget);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--offline').exists()
      ).toBeTruthy();
    });

    test('show target as offline when presence is not in state yet', async () => {
      store.commit('reset');
      getAvailability = jest.fn().mockImplementation(async () => {
        store.commit('updatePresence', { [offlineTarget]: false });
        return false;
      });
      wrapper = createWrapper(offlineTarget);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--offline').exists()
      ).toBeTruthy();
    });

    test('show target as online when presence is not in state yet', async () => {
      store.commit('reset');
      getAvailability = jest.fn().mockImplementation(async () => {
        store.commit('updatePresence', { [onlineTarget]: true });
        return true;
      });
      wrapper = createWrapper(onlineTarget);
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--online').exists()
      ).toBeTruthy();
    });

    test('input reacts to target going offline', async () => {
      store.commit('updatePresence', { [onlineTarget]: true });
      wrapper = createWrapper(onlineTarget);
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--online').exists()
      ).toBeTruthy();
      store.commit('updatePresence', { [onlineTarget]: false });
      await flushPromises();
      jest.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(
        wrapper.find('.address-input__availability--online').exists()
      ).toBeFalsy();
    });
  });
});
