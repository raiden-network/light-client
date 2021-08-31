/* eslint-disable @typescript-eslint/no-explicit-any */
import { $t } from '../../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { shallowMount } from '@vue/test-utils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

import { EventTypes } from 'raiden-ts';

import ChannelOpenAction from '@/components/channels/ChannelOpenAction.vue';

const defaultOpenChannelOptions = {
  tokenAddress: '0xToken',
  partnerAddress: '0xPartner',
  tokenAmount: constants.One,
};

function mockedOpenChannel(
  this: { events: EventTypes[] },
  _tokenAddress: string,
  _partnerAddress: string,
  _tokenAmount: BigNumber,
  callback: (event: { type: EventTypes }) => void,
): void {
  for (const type of this.events) {
    callback({ type });
  }
}

function createWrapper(options?: {
  openChannel: (...args: any[]) => void;
}): Wrapper<ChannelOpenAction> {
  const $raiden = {
    openChannel: options?.openChannel ?? jest.fn(),
  };

  return shallowMount(ChannelOpenAction, {
    propsData: { completionDelayTimeout: 0 },
    mocks: { $raiden, $t },
  });
}

describe('ChannelOpenAction', () => {
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

  test('has only open step if no deposit amount is zero', async () => {
    const wrapper = createWrapper();

    await (wrapper.vm as any).runAction({
      ...defaultOpenChannelOptions,
      tokenAmount: constants.Zero,
    });

    expect((wrapper.vm as any).steps.length).toBe(1);
    expect((wrapper.vm as any).steps[0].title).toContain('open');
  });

  test('adds transfer and deposit steps when deposit amount is greater than zero', async () => {
    const wrapper = createWrapper();

    await (wrapper.vm as any).runAction({
      ...defaultOpenChannelOptions,
      tokenAmount: constants.One,
    });

    expect((wrapper.vm as any).steps.length).toBe(3);
    expect((wrapper.vm as any).steps[0].title).toContain('open');
    expect((wrapper.vm as any).steps[1].title).toContain('transfer');
    expect((wrapper.vm as any).steps[2].title).toContain('deposit');
  });

  test('sets open step as active when action starts', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [] });
    const wrapper = createWrapper({ openChannel });

    await (wrapper.vm as any).runAction(defaultOpenChannelOptions);

    expect(wrapper.vm.$data.openStep.active).toBeTruthy();
  });

  test('completes open step and activates transfer step on opened event', async () => {
    const openChannel = mockedOpenChannel.bind({ events: [EventTypes.OPENED] });
    const wrapper = createWrapper({ openChannel });

    await (wrapper.vm as any).runAction(defaultOpenChannelOptions);

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.openStep.active).toBeFalsy();
    expect(wrapper.vm.$data.transferStep.active).toBeTruthy();
  });

  test('completes transfer step and activates deposit step on confirmed event', async () => {
    const openChannel = mockedOpenChannel.bind({
      events: [EventTypes.OPENED, EventTypes.CONFIRMED],
    });
    const wrapper = createWrapper({ openChannel });

    await (wrapper.vm as any).runAction(defaultOpenChannelOptions);

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.active).toBeFalsy();
    expect(wrapper.vm.$data.depositStep.active).toBeTruthy();
  });

  test('completes deposit step on deposited event', async () => {
    const openChannel = mockedOpenChannel.bind({
      events: [EventTypes.OPENED, EventTypes.CONFIRMED, EventTypes.DEPOSITED],
    });
    const wrapper = createWrapper({ openChannel });

    await (wrapper.vm as any).runAction(defaultOpenChannelOptions);

    expect(wrapper.vm.$data.openStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.transferStep.completed).toBeTruthy();
    expect(wrapper.vm.$data.depositStep.active).toBeFalsy();
  });
});
