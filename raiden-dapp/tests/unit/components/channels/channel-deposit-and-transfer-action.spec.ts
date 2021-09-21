/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';

import ChannelDepositAndTransferAction from '@/components/channels/ChannelDepositAndTransferAction.vue';

const defaultDepositOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
  tokenAmount: constants.One,
};

function createWrapper(options?: {
  transferTokenAmount?: BigNumber;
  paymentIdentifier?: BigNumber;
  deposit?: (...args: any[]) => void;
  transfer?: (...args: any[]) => void;
}): Wrapper<ChannelDepositAndTransferAction> {
  const $raiden = {
    deposit: options?.deposit ?? jest.fn(),
    transfer: options?.transfer ?? jest.fn(),
  };

  const fixedRunOptions = {
    transferTokenAmount: options?.transferTokenAmount ?? constants.One,
    paymentIdentifier: options?.paymentIdentifier ?? constants.Two,
  };

  return shallowMount(ChannelDepositAndTransferAction, {
    propsData: { fixedRunOptions, completionDelayTimeout: 0 },
    mocks: { $raiden, $t },
  });
}

describe('ChannelDepositAndTransferAction', () => {
  afterEach(() => {
    flushPromises();
  });

  test('executes raiden service deposit with correct arguments', async () => {
    const deposit = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({ deposit });

    await (wrapper.vm as any).runAction({
      tokenAddress: '0xToken',
      partnerAddress: '0xPartner',
      tokenAmount: constants.One,
    });

    expect(deposit).toHaveBeenCalledTimes(1);
    expect(deposit).toHaveBeenLastCalledWith('0xToken', '0xPartner', constants.One);
  });

  test('executes raiden service transfer with correct arguments', async () => {
    const transfer = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({
      transferTokenAmount: constants.One,
      paymentIdentifier: constants.Two,
      transfer,
    });

    await (wrapper.vm as any).runAction({
      tokenAddress: '0xToken',
      partnerAddress: '0xPartner',
    });

    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenLastCalledWith(
      '0xToken',
      '0xPartner',
      constants.One,
      constants.Two,
    );
  });

  test('sets deposit step to be active before calling raiden service', async () => {
    const deposit = jest.fn().mockReturnValue(new Promise(() => undefined));
    const wrapper = createWrapper({ deposit });

    (wrapper.vm as any).runAction(defaultDepositOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.depositStep.active).toBeTruthy();
  });

  test('completes deposit step and activates transfer step when deposit finishes', async () => {
    const deposit = jest.fn().mockResolvedValue(undefined);
    const transfer = jest.fn().mockReturnValue(new Promise(() => undefined));
    const wrapper = createWrapper({ deposit, transfer });

    (wrapper.vm as any).runAction(defaultDepositOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.depositStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.depositStep.active).toBeFalsy();
    expect(wrapper.vm.$data.transferStep.active).toBeTruthy();
  });

  test('completes transfer step when transfer finishes', async () => {
    const deposit = jest.fn().mockResolvedValue(undefined);
    const transfer = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({ deposit, transfer });

    (wrapper.vm as any).runAction(defaultDepositOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.depositStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.active).toBeFalsy();
  });
});
