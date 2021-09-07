/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';

import TransferAction from '@/components/transfer/TransferAction.vue';

const defaultTransferOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
};

function createWrapper(options?: {
  transferTokenAmount?: BigNumber;
  paymentIdentifier?: BigNumber;
  transfer?: (...args: any[]) => void;
}): Wrapper<TransferAction> {
  const $raiden = {
    transfer: options?.transfer ?? jest.fn(),
  };

  return shallowMount(TransferAction, {
    propsData: {
      transferTokenAmount: options?.transferTokenAmount ?? constants.One,
      paymentIdentifier: options?.paymentIdentifier ?? constants.Two,
      completionDelayTimeout: 0,
    },
    mocks: { $raiden, $t },
  });
}

describe('TransferAction', () => {
  afterEach(() => {
    flushPromises();
  });

  test('executes raiden service deposit with correct arguments', async () => {
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

  test('sets transfer step to be active before calling raiden service', async () => {
    const transfer = jest.fn().mockReturnValue(new Promise(() => undefined));
    const wrapper = createWrapper({ transfer });

    (wrapper.vm as any).runAction(defaultTransferOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.transferStep.active).toBeTruthy();
  });

  test('completes transfer step when transfer finishes', async () => {
    const transfer = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({ transfer });

    (wrapper.vm as any).runAction(defaultTransferOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.active).toBeFalsy();
  });
});
