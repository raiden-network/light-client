/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';

import type { RaidenPaths } from 'raiden-ts';

import MediatedTransfer from '@/components/transfer/MediatedTransferAction.vue';

const defaultTransferOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
};

function createWrapper(options?: {
  transferTokenAmount?: BigNumber;
  paymentIdentifier?: BigNumber;
  route?: RaidenPaths[number];
  transfer?: (...args: any[]) => void;
}): Wrapper<MediatedTransfer> {
  const $raiden = {
    transfer: options?.transfer ?? jest.fn(),
  };

  const fixedRunOptions = {
    transferTokenAmount: options?.transferTokenAmount ?? constants.One,
    paymentIdentifier: options?.paymentIdentifier ?? constants.Two,
    route: options?.route ?? 'no-actual-route',
  };

  return shallowMount(MediatedTransfer, {
    propsData: { fixedRunOptions, completionDelayTimeout: 0 },
    mocks: { $raiden, $t },
  });
}

describe('MediatedTransferAction', () => {
  afterEach(() => {
    flushPromises();
  });

  test('executes raiden service transfer with correct arguments', async () => {
    const transfer = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({
      transferTokenAmount: constants.One,
      paymentIdentifier: constants.Two,
      route: 'no-actual-route' as unknown as RaidenPaths[number],
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
      ['no-actual-route'],
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
