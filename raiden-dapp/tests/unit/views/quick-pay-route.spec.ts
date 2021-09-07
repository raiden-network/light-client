import { $t } from '../utils/mocks';

import type { Wrapper } from '@vue/test-utils';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import { BigNumber, constants } from 'ethers';
import Vuex, { Store } from 'vuex';

import type { Address, RaidenChannel } from 'raiden-ts';

import ChannelDepositAndTransferAction from '@/components/channels/ChannelDepositAndTransferAction.vue';
import ChannelOpenAndTransferAction from '@/components/channels/ChannelOpenAndTransferAction.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import TransferAction from '@/components/transfer/TransferAction.vue';
import type { Token } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import QuickPayRoute from '@/views/QuickPayRoute.vue';

import { generateChannel, generateRoute, generateToken } from '../utils/data-generator';

const localVue = createLocalVue();
localVue.use(Vuex);

function createWrapper(options?: {
  tokenAddress?: string;
  targetAddress?: string;
  tokenAmount?: string;
  paymentIdentifier?: string;
  redirectTo?: string;
  token?: Token;
  channels?: RaidenChannel[];
  accountAddress?: string;
  disconnect?: () => void;
  push?: () => void;
}): Wrapper<QuickPayRoute> {
  const token = options?.token ?? generateToken();

  const getters = {
    channels: () => () => options?.channels ?? [],
    token: () => () => token,
  };

  const store = new Store({ getters });

  const $raiden = {
    getAccount: () => options?.accountAddress,
    disconnect: options?.disconnect ?? jest.fn(),
  };

  const $route = generateRoute({
    query: {
      tokenAddress: options?.tokenAddress ?? '0x59105441977ecD9d805A4f5b060E34676F50F806',
      targetAddress: options?.targetAddress ?? '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf',
      amount: options?.tokenAmount ?? '1',
      identifier: options?.paymentIdentifier ?? '2',
      redirectTo: options?.redirectTo ?? '',
    },
  });

  const $router = {
    push: options?.push ?? jest.fn(),
  };

  return shallowMount(QuickPayRoute, {
    localVue,
    store,
    mocks: { $raiden, $route, $router, $t },
    stubs: ['i18n'],
  });
}

const channelWithTarget = generateChannel({
  partner: '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf' as Address,
  capacity: constants.Zero,
});

const otherChannel = generateChannel({
  partner: '0x3D389c9B67cA85F1de2EbeF648C54d740365c366' as Address,
  capacity: constants.Two,
});

const optionsForStraightTransfer = {
  tokenAmount: '1',
  channels: [otherChannel],
};

const optionsForChannelDepositAndTransfer = {
  targetAddress: '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf',
  tokenAmount: '5',
  channels: [channelWithTarget, otherChannel],
};

const optionsForChannelDepositAndTransferWithTransferFirst = {
  ...optionsForChannelDepositAndTransfer,
  tokenAmount: '1',
};

const optionsForChannelOpenAndTransfer = {
  targetAddress: '0xdA75b5Cd196C6C8292B567Fdc78B33A886ce0d80',
  tokenAmount: '5',
  channels: [otherChannel],
};

const optionsForChannelOpenAndTransferWithTransferFirst = {
  ...optionsForChannelOpenAndTransfer,
  tokenAmount: '1',
};

describe('QuickPayRoute.vue', () => {
  describe('transfer information', () => {
    test('displays header', () => {
      const wrapper = createWrapper();
      const header = wrapper.find('.quick-pay__transfer-information__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toContain('quick-pay.transfer-information-labels.header');
    });

    test('displays token information', () => {
      const token = generateToken();
      const wrapper = createWrapper({ token });
      const tokenInformation = wrapper.find('.quick-pay__transfer-information__token');

      expect(tokenInformation.exists()).toBeTruthy();
      expect(tokenInformation.html()).toContain(token);
    });

    test('displays target address', () => {
      const wrapper = createWrapper({
        targetAddress: '0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf',
      });
      const addressDisplay = wrapper.find('.quick-pay__transfer-information__target');

      expect(addressDisplay.exists()).toBeTruthy();
      expect(addressDisplay.html()).toContain('0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf');
      expect(addressDisplay.html()).toContain(
        'quick-pay.transfer-information-labels.target-address',
      );
    });

    test('displays token amount', () => {
      const token = generateToken();
      const wrapper = createWrapper({ tokenAmount: '1', token });
      const amountDisplay = wrapper.find('.quick-pay__transfer-information__amount');

      expect(amountDisplay.exists()).toBeTruthy();
      expect(amountDisplay.html()).toContain(constants.One);
      expect(amountDisplay.html()).toContain(token);
      expect(amountDisplay.html()).toContain('quick-pay.transfer-information-labels.token-amount');
    });
  });

  describe('invalid query parameters', () => {
    test('token address must be defined', () => {
      const wrapper = createWrapper({ tokenAddress: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token address must be in cheksum format', () => {
      const wrapper = createWrapper({
        tokenAddress: '0x59105441977ecd9d805a4f5b060e34676f50f806',
      });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('target address must be defined', () => {
      const wrapper = createWrapper({ targetAddress: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('target address must be in cheksum format', () => {
      const wrapper = createWrapper({
        targetAddress: '0x1f916ab5cf1b30b22f24ebf435f53ee665344acf',
      });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token amount must be defined', () => {
      const wrapper = createWrapper({ tokenAmount: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('token amount must be bignumberish', () => {
      const wrapper = createWrapper({ tokenAmount: 'one' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('payment identifier must be defined', () => {
      const wrapper = createWrapper({ paymentIdentifier: '' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });

    test('payment identifier must be bignumberish', () => {
      const wrapper = createWrapper({ paymentIdentifier: 'one' });
      const errorDialog = wrapper.findComponent(ErrorDialog);

      expect(errorDialog.exists()).toBeTruthy();
    });
  });

  describe('transfer action', () => {
    test('displays no header', () => {
      const wrapper = createWrapper(optionsForStraightTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeFalsy();
    });

    test('displays action component if any channel has enough capacity', () => {
      const wrapper = createWrapper({ ...optionsForStraightTransfer, paymentIdentifier: '501' });
      const action = wrapper.findComponent(TransferAction);

      expect(action.exists()).toBeTruthy();
      expect(action.html()).toContain(BigNumber.from('1')); // token amount
      expect(action.html()).toContain(BigNumber.from('501')); // payment identifier
    });

    test('displays message', () => {
      const wrapper = createWrapper(optionsForStraightTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.transfer');
    });
  });

  describe('channel deposit and transfer action', () => {
    test('displays header', () => {
      const wrapper = createWrapper(optionsForChannelDepositAndTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toBe('quick-pay.action-titles.channel-deposit');
    });

    test('displays action component if no channel has enoug capacity but there is a direct one', () => {
      const wrapper = createWrapper({
        ...optionsForChannelDepositAndTransfer,
        tokenAmount: '5',
        paymentIdentifier: '501',
      });
      const action = wrapper.findComponent(ChannelDepositAndTransferAction);

      expect(action.exists()).toBeTruthy();
      expect(action.html()).toContain(BigNumber.from('5'));
      expect(action.html()).toContain(BigNumber.from('501'));
      expect(action.html()).toContain('showprogressindialog');
      expect(action.html()).toContain('quick-pay.action-titles.channel-deposit-and-transfer');
    });

    test('displays message', () => {
      const wrapper = createWrapper(optionsForChannelDepositAndTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.channel-deposit-and-transfer');
    });
  });

  describe('channel open and transfer action', () => {
    test('displays header', () => {
      const wrapper = createWrapper(optionsForChannelOpenAndTransfer);
      const header = wrapper.find('.quick-pay__action__header');

      expect(header.exists()).toBeTruthy();
      expect(header.text()).toBe('quick-pay.action-titles.channel-open');
    });

    test('displays action component if no channel has enoug capacity and there is no direct one', () => {
      const wrapper = createWrapper({
        ...optionsForChannelOpenAndTransfer,
        tokenAmount: '5',
        paymentIdentifier: '501',
      });
      const action = wrapper.findComponent(ChannelOpenAndTransferAction);

      expect(action.exists()).toBeTruthy();
      expect(action.exists()).toBeTruthy();
      expect(action.html()).toContain(BigNumber.from('5'));
      expect(action.html()).toContain(BigNumber.from('501'));
      expect(action.html()).toContain('showprogressindialog');
      expect(action.html()).toContain('quick-pay.action-titles.channel-open-and-transfer');
    });

    test('displays message', () => {
      const wrapper = createWrapper(optionsForChannelOpenAndTransfer);
      const message = wrapper.find('.quick-pay__action__message');

      expect(message.exists()).toBeTruthy();
      expect(message.html()).toContain('quick-pay.action-messages.channel-open-and-transfer');
    });
  });

  describe('action events', () => {
    test('hides action message when action starts', async () => {
      const wrapper = createWrapper();
      const action = wrapper.get('.quick-pay__action__component');
      expect(wrapper.find('.quick-pay__action__message').exists()).toBeTruthy();

      action.vm.$emit('started');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.quick-pay__action__message').exists()).toBeFalsy();
    });

    describe('redirections', () => {
      const originalWindowLocation = global.window.location;
      let windowReplaceSpy: jest.Mock;

      beforeAll(() => {
        windowReplaceSpy = jest.fn();
        Reflect.deleteProperty(global.window, 'location');
        global.window.location = {
          ...originalWindowLocation,
          replace: windowReplaceSpy,
        };
      });

      beforeEach(() => {
        jest.resetAllMocks();
      });

      afterAll(() => {
        global.window.location = originalWindowLocation;
      });

      test('includes payment information parameters to specified target on completed action', async () => {
        const wrapper = createWrapper({
          redirectTo: 'https://redirect.target',
          paymentIdentifier: '501',
          accountAddress: '0x3D389c9B67cA85F1de2EbeF648C54d740365c366',
        });
        const action = wrapper.get('.quick-pay__action__component');

        action.vm.$emit('completed');
        await wrapper.vm.$nextTick();

        expect(windowReplaceSpy).toHaveBeenCalledTimes(1);
        expect(windowReplaceSpy).toHaveBeenLastCalledWith(
          'https://redirect.target?identifier=501&payerAddress=0x3D389c9B67cA85F1de2EbeF648C54d740365c366',
        );
      });

      test('shuts down raiden before redirect', async () => {
        const disconnect = jest.fn();
        const wrapper = createWrapper({ disconnect, redirectTo: 'https://redirect.target' });
        const action = wrapper.get('.quick-pay__action__component');

        action.vm.$emit('completed');
        await wrapper.vm.$nextTick();

        expect(disconnect).toHaveBeenCalledTimes(1);
      });

      test('redirects to transfer screen of given token if no redirect target given', async () => {
        const push = jest.fn();
        const wrapper = createWrapper({
          push,
          redirectTo: '',
          tokenAddress: '0x59105441977ecD9d805A4f5b060E34676F50F806',
        });
        const action = wrapper.get('.quick-pay__action__component');

        action.vm.$emit('completed');
        await wrapper.vm.$nextTick();

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenLastCalledWith({
          name: RouteNames.TRANSFER,
          params: { token: '0x59105441977ecD9d805A4f5b060E34676F50F806' },
        });
      });

      test('includes failed state if there is an error and the user dismisses the dialog', async () => {
        const wrapper = createWrapper({
          redirectTo: 'https://redirect.target',
          paymentIdentifier: '501',
        });
        const action = wrapper.get('.quick-pay__action__component');

        action.vm.$emit('failed', new Error());
        action.vm.$emit('dialogClosed');
        await wrapper.vm.$nextTick();

        expect(windowReplaceSpy).toHaveBeenCalledTimes(1);
        expect(windowReplaceSpy).toHaveBeenLastCalledWith(
          'https://redirect.target?identifier=501&failed=true',
        );
      });
    });

    describe('failed action handling', () => {
      test('displays action message again on any error', async () => {
        const wrapper = createWrapper();
        const action = wrapper.get('.quick-pay__action__component');

        const error = new Error('Any transfer error');
        action.vm.$emit('failed', error);
        await wrapper.vm.$nextTick();

        const message = wrapper.find('.quick-pay__action__message');
        expect(message.exists()).toBeTruthy();
      });

      test('displays error dialog when error is not recoverable', async () => {
        const wrapper = createWrapper();
        const action = wrapper.get('.quick-pay__action__component');

        const error = new Error('The requested target is offline.');
        action.vm.$emit('failed', error);
        await wrapper.vm.$nextTick();

        const errorDialog = wrapper.findComponent(ErrorDialog);
        expect(errorDialog.exists()).toBeTruthy();
      });

      describe('can recover from no valid routes found error', () => {
        test('switches to channel deposit and transfer action if there is a direct channel', async () => {
          const wrapper = createWrapper(optionsForChannelDepositAndTransferWithTransferFirst);
          const transferAction = wrapper.getComponent(TransferAction);

          const error = new Error('No valid routes found.');
          transferAction.vm.$emit('failed', error);
          await wrapper.vm.$nextTick();

          const channelDepositAndTransferAction = wrapper.findComponent(
            ChannelDepositAndTransferAction,
          );
          expect(channelDepositAndTransferAction.exists()).toBeTruthy();
        });

        test('switches to channel open and transfer action if there is no direct channel', async () => {
          const wrapper = createWrapper(optionsForChannelOpenAndTransferWithTransferFirst);
          const transferAction = wrapper.getComponent(TransferAction);

          const error = new Error('No valid routes found.');
          transferAction.vm.$emit('failed', error);
          await wrapper.vm.$nextTick();

          const channelOpenAndTransferAction = wrapper.findComponent(ChannelOpenAndTransferAction);
          expect(channelOpenAndTransferAction.exists()).toBeTruthy();
        });
      });

      describe('can recover from no route between nodes found error', () => {
        test('switches to channel deposit and transfer action if there is a direct channel', async () => {
          const wrapper = createWrapper(optionsForChannelDepositAndTransferWithTransferFirst);
          const transferAction = wrapper.getComponent(TransferAction);

          const error = new Error('No route between nodes found.');
          transferAction.vm.$emit('failed', error);
          await wrapper.vm.$nextTick();

          const channelDepositAndTransferAction = wrapper.findComponent(
            ChannelDepositAndTransferAction,
          );
          expect(channelDepositAndTransferAction.exists()).toBeTruthy();
        });

        test('switches to channel open and transfer action if there is no direct channel', async () => {
          const wrapper = createWrapper(optionsForChannelOpenAndTransferWithTransferFirst);
          const transferAction = wrapper.getComponent(TransferAction);

          const error = new Error('No route between nodes found.');
          transferAction.vm.$emit('failed', error);
          await wrapper.vm.$nextTick();

          const channelOpenAndTransferAction = wrapper.findComponent(ChannelOpenAndTransferAction);
          expect(channelOpenAndTransferAction.exists()).toBeTruthy();
        });
      });
    });
  });
});
