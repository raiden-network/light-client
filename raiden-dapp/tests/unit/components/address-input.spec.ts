jest.mock('@/services/raiden-service');
jest.useFakeTimers();

import flushPromises from 'flush-promises';
import store from '@/store';
import { mount, Wrapper } from '@vue/test-utils';
import AddressInput from '@/components/AddressInput.vue';
import Vue from 'vue';
import Vuetify from 'vuetify';
import { mockInput } from '../utils/interaction-utils';
import RaidenService from '@/services/raiden-service';
import Mocked = jest.Mocked;

Vue.use(Vuetify);

describe('AddressInput', function() {
  let wrapper: Wrapper<AddressInput>;
  let raiden: Mocked<RaidenService>;
  let mockIdenticon: jest.Mock<any, any>;
  const excludedAddress: string = '0x65E84e07dD79F3f03d72bc0fab664F56E6C55909';

  beforeEach(() => {
    mockIdenticon = jest.fn().mockResolvedValue('');
    raiden = new RaidenService(store) as Mocked<RaidenService>;
    wrapper = mount(AddressInput, {
      propsData: {
        value: '',
        exclude: [excludedAddress]
      },
      mocks: {
        $raiden: raiden,
        $identicon: {
          getIdenticon: mockIdenticon
        },
        $t: (msg: string) => msg
      }
    });
  });

  it('should show no validation messages', () => {
    const messages = wrapper.find('.v-messages__message');
    expect(wrapper.props().value).toBe('');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('');
  });

  it('should show a this address cannot be an empty message', async () => {
    mockInput(wrapper, '0x21b');
    await wrapper.vm.$nextTick();
    mockInput(wrapper);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().input).toBeTruthy();
    expect(wrapper.emitted().input[0]).toEqual(['']);
    expect(wrapper.emitted().input[1]).toEqual(undefined);

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.empty');
  });

  it('should should show a no valid address message', async () => {
    mockInput(wrapper, '0x21b');
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.invalid-address');
  });

  it('should should show a not checksum format message if address not in checksum format', async () => {
    mockInput(wrapper, '0x774afb0652ca2c711fd13e6e9d51620568f6ca82');
    await wrapper.vm.$nextTick();

    const messages = wrapper.find('.v-messages__message');
    expect(messages.exists()).toBe(true);
    expect(messages.text()).toBe('address-input.error.no-checksum');
  });

  test('valid checksum address should fire input event', async () => {
    mockInput(wrapper, '0x1D36124C90f53d491b6832F1c073F43E2550E35b');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().input).toBeTruthy();
    expect(wrapper.emitted().input[0]).toEqual([
      '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
    ]);
  });

  test('setting a valid address should render a blockie', async () => {
    wrapper.setProps({ value: '0x1D36124C90f53d491b6832F1c073F43E2550E35b' });
    expect(mockIdenticon).toHaveBeenCalled();
  });

  describe('resolving ens names', () => {
    test('successfully resolved', async () => {
      raiden.ensResolve = jest
        .fn()
        .mockResolvedValue('0x1D36124C90f53d491b6832F1c073F43E2550E35b');
      mockInput(wrapper, 'ens');
      await wrapper.vm.$nextTick();
      mockInput(wrapper, 'enstest');
      await wrapper.vm.$nextTick();
      mockInput(wrapper, 'enstest.test');
      await wrapper.vm.$nextTick();
      jest.runAllTimers();
      await flushPromises();

      expect(wrapper.vm.$data.hint).toEqual(
        '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      );
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual([
        '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
      ]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(0);
    });

    test('could not resolve an address', async () => {
      raiden.ensResolve = jest.fn().mockResolvedValue(null);

      mockInput(wrapper, 'enstest.test');
      await wrapper.vm.$nextTick();
      jest.runAllTimers();
      await flushPromises();

      expect(wrapper.vm.$data.hint).toEqual('');
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual([undefined]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain(
        'address-input.error.ens-resolve-failed'
      );
    });

    test('failed to resolve an address', async () => {
      raiden.ensResolve = jest
        .fn()
        .mockRejectedValue(Error('something went wrong'));

      mockInput(wrapper, 'enstest.test');
      await wrapper.vm.$nextTick();
      jest.runAllTimers();
      await flushPromises();

      expect(wrapper.vm.$data.hint).toEqual('');
      expect(wrapper.emitted().input).toBeTruthy();
      expect(wrapper.emitted().input[0]).toEqual([undefined]);

      expect(wrapper.vm.$data.errorMessages).toHaveLength(1);
      expect(wrapper.vm.$data.errorMessages).toContain(
        'address-input.error.ens-resolve-failed'
      );
    });
  });

  describe('excluded', () => {
    it('should show error message if excluded address is entered', async () => {
      mockInput(wrapper, excludedAddress);
      await wrapper.vm.$nextTick();

      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(true);
      expect(messages.text()).toBe(
        'address-input.error.invalid-excluded-address'
      );
    });

    it('should not show error message if there is no exclude prop', async () => {
      wrapper = mount(AddressInput, {
        propsData: {
          value: ''
        },
        mocks: {
          $raiden: raiden,
          $identicon: {
            getIdenticon: mockIdenticon
          },
          $t: (msg: string) => msg
        }
      });

      mockInput(wrapper, excludedAddress);
      await wrapper.vm.$nextTick();

      const messages = wrapper.find('.v-messages__message');
      expect(messages.exists()).toBe(false);
    });
  });
});
