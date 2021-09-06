/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { BigNumber, constants } from 'ethers';
import Vue from 'vue';
import Vuetify from 'vuetify';
import Vuex from 'vuex';

import type { Address, RaidenChannel, UInt } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import ChannelActionForm from '@/components/channels/ChannelActionForm.vue';
import type { Token } from '@/model/types';

import { generateChannel, generateToken } from '../../utils/data-generator';

Vue.use(Vuex);

const vuetify = new Vuetify();
const token = generateToken();

async function createWrapper(options?: {
  tokenAddress?: string;
  hideTokenAddress?: boolean;
  hidePartnerAddress?: boolean;
  token?: Token;
  partnerAddress?: string;
  partnerAddressEditable?: boolean;
  restrictToChannelPartners?: boolean;
  excludeChannelPartners?: boolean;
  channels?: RaidenChannel[];
  tokenAmount?: string;
  hideTokenAmount?: boolean;
  tokenAmountEditable?: boolean;
  limitToTokenBalance?: boolean;
  limitToChannelWithdrawable?: boolean;
  minimumTokenAmount?: BigNumber;
  confirmButtonLabel?: string;
  stickyButton?: boolean;
  runAction?: () => void;
  inputsAreValid?: boolean;
  fetchAndUpdateTokenData?: () => void;
  monitorToken?: () => void;
}): Promise<Wrapper<ChannelActionForm>> {
  const getters = {
    token: () => () => options?.token ?? token,
    channels: () => () => options?.channels ?? [],
  };
  const store = new Vuex.Store({ getters });

  const $raiden = {
    fetchAndUpdateTokenData: options?.fetchAndUpdateTokenData ?? jest.fn(),
    monitorToken: options?.monitorToken ?? jest.fn(),
  };

  const wrapper = shallowMount(ChannelActionForm, {
    vuetify,
    store,
    mocks: { $raiden, $t },
    propsData: {
      tokenAddress: options?.tokenAddress,
      hideTokenAddress: options?.hideTokenAddress,
      partnerAddress: options?.partnerAddress,
      hidePartnerAddress: options?.hidePartnerAddress,
      partnerAddressEditable: options?.partnerAddressEditable,
      restrictToChannelPartners: options?.restrictToChannelPartners,
      excludeChannelPartners: options?.excludeChannelPartners,
      tokenAmount: options?.tokenAmount,
      hideTokenAmount: options?.hideTokenAmount,
      tokenAmountEditable: options?.tokenAmountEditable,
      limitToTokenBalance: options?.limitToTokenBalance,
      limitToChannelWithdrawable: options?.limitToChannelWithdrawable,
      minimumTokenAmount: options?.minimumTokenAmount,
      confirmButtonLabel: options?.confirmButtonLabel ?? 'confirm label',
      stickyButton: options?.stickyButton,
      runAction: options?.runAction ?? jest.fn(),
    },
    stubs: ['v-form'],
  });

  if (typeof options?.inputsAreValid === 'boolean') {
    (wrapper.vm as any).inputsAreValid = options.inputsAreValid;
    await wrapper.vm.$nextTick();
  }

  return wrapper;
}

async function submitForm(wrapper: Wrapper<ChannelActionForm>): Promise<void> {
  const form = wrapper.get('.channel-action-form');

  form.vm.$emit('submit', { preventDefault: () => null });
  await wrapper.vm.$nextTick();
}

describe('ChannelActionForm.vue', () => {
  describe('token address', () => {
    test('hides form section', async () => {
      const wrapper = await createWrapper({ hideTokenAddress: true });
      const display = wrapper.find(
        '.channel-action-form__token-address.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__token-address.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeFalsy();
      expect(input.exists()).toBeFalsy();
    });

    test('only displays value if not set to be editable', async () => {
      // Note that this is atm the default as the token address is not editable yet.
      const wrapper = await createWrapper({ tokenAddress: token.address });
      const display = wrapper.find(
        '.channel-action-form__token-address.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__token-address.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeTruthy();
      expect(input.exists()).toBeFalsy();
    });

    test('updates token information initially and on change', async () => {
      const fetchAndUpdateTokenData = jest.fn();
      const monitorToken = jest.fn();
      const wrapper = await createWrapper({
        tokenAddress: '0xToken',
        fetchAndUpdateTokenData,
        monitorToken,
      });

      expect(fetchAndUpdateTokenData).toHaveBeenCalledTimes(1);
      expect(fetchAndUpdateTokenData).toHaveBeenLastCalledWith(['0xToken']);
      expect(monitorToken).toHaveBeenCalledTimes(1);
      expect(monitorToken).toHaveBeenLastCalledWith('0xToken');

      wrapper.setProps({ ...wrapper.props, tokenAddress: '0xOtherToken' });
      await wrapper.vm.$nextTick();

      expect(fetchAndUpdateTokenData).toHaveBeenCalledTimes(2);
      expect(fetchAndUpdateTokenData).toHaveBeenLastCalledWith(['0xOtherToken']);
      expect(monitorToken).toHaveBeenCalledTimes(2);
      expect(monitorToken).toHaveBeenLastCalledWith('0xOtherToken');
    });
  });

  describe('partner address', () => {
    test('hides form section', async () => {
      const wrapper = await createWrapper({ hidePartnerAddress: true });
      const display = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeFalsy();
      expect(input.exists()).toBeFalsy();
    });

    test('only displays value if not set to be editable', async () => {
      const wrapper = await createWrapper({
        partnerAddressEditable: false,
        partnerAddress: '0xPartner',
      });
      const display = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeTruthy();
      expect(display.html()).toContain('0xPartner');
      expect(input.exists()).toBeFalsy();
    });

    test('allows to edit value if set so', async () => {
      const wrapper = await createWrapper({
        partnerAddressEditable: true,
        partnerAddress: '0xPartner',
      });
      const display = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__partner-address.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeFalsy();
      expect(input.exists()).toBeTruthy();
      expect(input.html()).toContain('0xPartner');
    });

    test('restricts to existing channel partners if set so', async () => {
      const channel = generateChannel({ partner: '0xPartner' as Address });
      const wrapper = await createWrapper({
        restrictToChannelPartners: true,
        partnerAddressEditable: true,
        tokenAddress: channel.token,
        channels: [channel],
      });
      const input = wrapper.get(
        '.channel-action-form__partner-address.channel-action-form__editable-input',
      );

      expect(input.html()).toContain('0xPartner');
    });

    test('excludes existing channel partners if set so', async () => {
      const channel = generateChannel({ partner: '0xPartner' as Address });
      const wrapper = await createWrapper({
        excludeChannelPartners: true,
        partnerAddressEditable: true,
        tokenAddress: channel.token,
        channels: [channel],
      });
      const input = wrapper.get(
        '.channel-action-form__partner-address.channel-action-form__editable-input',
      );

      expect(input.html()).toContain('0xPartner');
    });
  });

  describe('token amount', () => {
    test('hides form section if set so', async () => {
      const wrapper = await createWrapper({ hideTokenAmount: true });
      const display = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeFalsy();
      expect(input.exists()).toBeFalsy();
    });

    test('only displays value if not set to be editable', async () => {
      const wrapper = await createWrapper({ tokenAmountEditable: false, tokenAmount: '0.1' });
      const display = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeTruthy();
      expect(display.html()).toContain('0.1');
      expect(input.exists()).toBeFalsy();
    });

    test('allows to edit value if set so', async () => {
      const wrapper = await createWrapper({ tokenAmountEditable: true, tokenAmount: '0.1' });
      const display = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__fixed-input-wrapper',
      );
      const input = wrapper.find(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(display.exists()).toBeFalsy();
      expect(input.exists()).toBeTruthy();
      expect(input.html()).toContain('0.1');
    });

    test('limits input to token balance if set so', async () => {
      const token = generateToken({ balance: '10' });
      const wrapper = await createWrapper({
        limitToTokenBalance: true,
        tokenAmountEditable: true,
        tokenAddress: token.address,
        token,
      });
      const input = wrapper.get(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(input.html()).toContain('10');
    });

    test('limits input to channel withdrawable if set so', async () => {
      const channel = generateChannel({ ownWithdrawable: BigNumber.from('10') as UInt<32> });
      const wrapper = await createWrapper({
        limitToChannelWithdrawable: true,
        tokenAmountEditable: true,
        tokenAddress: channel.token,
        partnerAddress: channel.partner,
        channels: [channel],
      });
      const input = wrapper.get(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(input.html()).toContain('10');
    });

    test('limits input to minimum amount if set so', async () => {
      const wrapper = await createWrapper({
        minimumTokenAmount: constants.Two,
        tokenAmountEditable: true,
      });
      const input = wrapper.get(
        '.channel-action-form__token-amount.channel-action-form__editable-input',
      );

      expect(input.html()).toContain(constants.Two);
    });
  });

  describe('emit input update event', () => {
    test('emits event', async () => {
      const wrapper = await createWrapper({
        tokenAddress: '0xToken',
        partnerAddress: '0xPartner',
        tokenAmount: '0.1',
      });
      const form = wrapper.get('.channel-action-form');

      form.vm.$emit('input');
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('inputsChanged')).toBeTruthy();
      expect(wrapper.emitted('inputsChanged')![0]).toEqual([
        {
          tokenAddress: '0xToken',
          partnerAddress: '0xPartner',
          tokenAmount: '0.1',
        },
      ]);
    });
  });

  describe('action button', () => {
    test('displays set label', async () => {
      const wrapper = await createWrapper({ confirmButtonLabel: 'test label' });
      const button = wrapper.findComponent(ActionButton);

      expect(button.html()).toContain('test label');
    });

    test('is disabled if inputs are not valid', async () => {
      const wrapper = await createWrapper({ inputsAreValid: false });
      const button = wrapper.findComponent(ActionButton);

      expect(button.attributes('enabled')).toBeFalsy();
    });

    test('is enabled if inputs are valid', async () => {
      const wrapper = await createWrapper({ inputsAreValid: true });
      const button = wrapper.findComponent(ActionButton);

      expect(button.attributes('enabled')).toBeTruthy();
    });

    test('is sticky if set so', async () => {
      const wrapper = await createWrapper({ stickyButton: true });
      const button = wrapper.findComponent(ActionButton);

      expect(button.attributes('sticky')).toBeTruthy();
    });
  });

  describe('submit', () => {
    test('executes given action with all form values', async () => {
      const token = generateToken({ address: '0xToken', decimals: 0 });
      const runAction = jest.fn();
      const wrapper = await createWrapper({
        tokenAddress: token.address,
        token,
        partnerAddress: '0xPartner',
        tokenAmount: '1',
        inputsAreValid: true,
        runAction,
      });

      await submitForm(wrapper);

      expect(runAction).toHaveBeenCalledTimes(1);
      expect(runAction).toHaveBeenLastCalledWith({
        tokenAddress: '0xToken',
        partnerAddress: '0xPartner',
        tokenAmount: BigNumber.from('1'),
      });
    });

    test('does not execute action if form is invalid', async () => {
      const runAction = jest.fn();
      const wrapper = await createWrapper({ inputsAreValid: false, runAction });

      await submitForm(wrapper);

      expect(runAction).not.toHaveBeenCalled();
    });
  });
});
