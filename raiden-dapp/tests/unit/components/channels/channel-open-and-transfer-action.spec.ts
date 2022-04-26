/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import flushPromises from 'flush-promises';

import { EventTypes } from 'raiden-ts';

import ChannelOpenAndTransferAction from '@/components/channels/ChannelOpenAndTransferAction.vue';

const defaultOpenChannelOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
  tokenAmount: constants.One,
};

function mockedOpenChannel(
  this: { events: EventTypes[]; resolve?: boolean },
  _tokenAddress: string,
  _partnerAddress: string,
  _tokenAmount: BigNumber,
  callback: (event: { type: EventTypes }) => void,
): Promise<void> {
  for (const type of this.events) {
    callback({ type });
  }

  return new Promise((resolve) => {
    if (this.resolve ?? true) {
      resolve();
    }
  });
}

function createWrapper(options?: {
  transferTokenAmount?: BigNumber;
  paymentIdentifier?: BigNumber;
  openChannel?: (...args: any[]) => void;
  transfer?: (...args: any[]) => void;
}): Wrapper<ChannelOpenAndTransferAction> {
  const $raiden = {
    openChannel: options?.openChannel ?? jest.fn(),
    transfer: options?.transfer ?? jest.fn(),
  };

  const fixedRunOptions = {
    transferTokenAmount: options?.transferTokenAmount ?? constants.One,
    paymentIdentifier: options?.paymentIdentifier ?? constants.Two,
  };

  return shallowMount(ChannelOpenAndTransferAction, {
    propsData: { fixedRunOptions, completionDelayTimeout: 0 },
    mocks: { $raiden, $t },
  });
}

describe('ChannelOpenAndTransferAction', () => {
  afterEach(() => {
    flushPromises();
  });

  test('executes raiden service open channel with correct arguments', async () => {
    const openChannel = jest.fn();
    const wrapper = createWrapper({ openChannel });

    await (wrapper.vm as any).runAction({
      tokenAddress: '0xToken',
      partnerAddress: '0xPartner',
      tokenAmount: constants.One,
    });

    expect(openChannel).toHaveBeenCalledTimes(1);
    expect(openChannel).toHaveBeenLastCalledWith(
      '0xToken',
      '0xPartner',
      constants.One,
      expect.any(Function),
    );
  });

  test('executes raiden service transfer with correct arguments', async () => {
    const transfer = jest.fn();
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

  test('sets open step as active when action starts', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [], resolve: false });
    const wrapper = createWrapper({ openChannel });

    (wrapper.vm as any).runAction(defaultOpenChannelOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.openStep.active).toBeTruthy();
  });

  test('completes open step and activates deposit step on opened event', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [EventTypes.OPENED], resolve: false });
    const wrapper = createWrapper({ openChannel });

    (wrapper.vm as any).runAction(defaultOpenChannelOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.openStep.active).toBeFalsy();
    expect(wrapper.vm.$data.depositStep.active).toBeTruthy();
  });

  test('completes deposit step and activates transfer step after a timeout when channel open finishes', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [EventTypes.OPENED], resolve: true });
    const transfer = jest.fn().mockReturnValue(new Promise(() => undefined));
    const wrapper = createWrapper({ openChannel, transfer });

    (wrapper.vm as any).runAction(defaultOpenChannelOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.depositStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.depositStep.active).toBeFalsy();
    expect(wrapper.vm.$data.transferStep.active).toBeTruthy();
  });

  test('completes transfer step on deposited event', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [EventTypes.OPENED] });
    const transfer = jest.fn().mockResolvedValue(undefined);
    const wrapper = createWrapper({ openChannel, transfer });

    await (wrapper.vm as any).runAction(defaultOpenChannelOptions);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.depositStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.active).toBeFalsy();
  }, 7000);
});
