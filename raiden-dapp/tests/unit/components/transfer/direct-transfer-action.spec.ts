/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';

import DirectTransferAction from '@/components/transfer/DirectTransferAction.vue';

const defaultTransferOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
};

function createWrapper(options?: {
  transferTokenAmount?: BigNumber;
  paymentIdentifier?: BigNumber;
  directRoute?: (...args: any[]) => void;
  transfer?: (...args: any[]) => void;
}): Wrapper<DirectTransferAction> {
  const $raiden = {
    directRoute: options?.directRoute ?? jest.fn().mockResolvedValue(['no-actual-route']),
    transfer: options?.transfer ?? jest.fn(),
  };

  return shallowMount(DirectTransferAction, {
    propsData: {
      transferTokenAmount: options?.transferTokenAmount ?? constants.One,
      paymentIdentifier: options?.paymentIdentifier ?? constants.Two,
      completionDelayTimeout: 0,
    },
    mocks: { $raiden, $t },
  });
}

describe('DirectTransferAction', () => {
  afterEach(() => {
    flushPromises();
  });

  test('fetches route from raiden service with correct arguments', async () => {
    const directRoute = jest.fn();
    const wrapper = createWrapper({ directRoute, transferTokenAmount: constants.One });

    await (wrapper.vm as any).runAction({
      tokenAddress: '0xToken',
      partnerAddress: '0xPartner',
    });

    expect(directRoute).toHaveBeenCalledTimes(1);
    expect(directRoute).toHaveBeenLastCalledWith('0xToken', '0xPartner', constants.One);
  });

  test('executes raiden service deposit with correct arguments', async () => {
    const directRoute = jest.fn().mockResolvedValue(['no-actual-route']);
    const transfer = jest.fn();
    const wrapper = createWrapper({
      directRoute,
      transfer,
      transferTokenAmount: constants.One,
      paymentIdentifier: constants.Two,
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
      ['no-actual-route'],
    );
  });

  test('sets transfer step to be active before calling raiden service', async () => {
    const directRoute = jest.fn().mockReturnValue(new Promise(() => undefined));
    const wrapper = createWrapper({ directRoute });

    (wrapper.vm as any).runAction(defaultTransferOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.transferStep.active).toBeTruthy();
  });

  test('completes transfer step when transfer finishes', async () => {
    const wrapper = createWrapper();

    (wrapper.vm as any).runAction(defaultTransferOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.active).toBeFalsy();
  });
});
