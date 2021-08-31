/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import { constants } from 'ethers';

import ChannelDepositAction from '@/components/channels/ChannelDepositAction.vue';

const defaultDepositOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
  tokenAmount: constants.One,
};

function createWrapper(options?: { deposit: () => void }): Wrapper<ChannelDepositAction> {
  const $raiden = {
    deposit: options?.deposit ?? jest.fn(),
  };

  return shallowMount(ChannelDepositAction, {
    propsData: { completionDelayTimeout: 0 },
    mocks: { $raiden, $t },
  });
}

describe('ChannelDepositAction', () => {
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

  test('sets deposit step to be active before calling raiden service', async () => {
    let resolve = (_value: unknown) => {
      return;
    };
    const deposit = jest.fn().mockImplementation(() => new Promise((r) => (resolve = r)));
    const wrapper = createWrapper({ deposit });

    (wrapper.vm as any).runAction(defaultDepositOptions);

    expect(wrapper.vm.$data.depositStep.active).toBeTruthy();

    resolve(null);
  });

  test('all steps are set to be completed when action is done', async () => {
    const wrapper = createWrapper();

    await (wrapper.vm as any).runAction(defaultDepositOptions);

    for (const step of (wrapper.vm as any).steps) {
      expect(step.completed).toBeTruthy();
    }
  });
});
