import { BigNumber, utils, constants } from 'ethers';
import { Route } from 'vue-router';
import { Token, Transfer } from '@/model/types';

import { Address, ChannelState, RaidenChannel, RaidenChannels } from 'raiden-ts';
import { RouteNames } from '@/router/route-names';
import { Tokens } from '@/types';
import { NotificationPayload } from '@/store/notifications/types';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

export const paymentId = BigNumber.from(4444);

export class TestData {
  static token: Token = {
    address: '0xtoken',
    decimals: 5,
    balance: utils.parseUnits('1.2', 5),
    name: 'TestToken',
    symbol: 'TTT',
  };

  static openChannel = {
    id: 278,
    openBlock: 1000,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b' as Address,
    partnerDeposit: BigNumber.from(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: BigNumber.from(10 ** 8),
    balance: constants.Zero,
    capacity: BigNumber.from(10 ** 8),
    ownWithdrawable: BigNumber.from(10 ** 8),
  } as RaidenChannel;

  static settlingChannel = {
    id: 279,
    openBlock: 1000,
    closeBlock: 1498,
    partner: '0x82641569b2062B545431cF6D7F0A418582865ba7' as Address,
    partnerDeposit: BigNumber.from(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.settling,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: BigNumber.from(10 ** 8),
    balance: constants.Zero,
    capacity: BigNumber.from(10 ** 8),
    ownWithdrawable: BigNumber.from(10 ** 8),
  } as RaidenChannel;

  static settlableChannel = {
    id: 280,
    openBlock: 1000,
    closeBlock: 1498,
    partner: '0x504300C525CbE91Adb3FE0944Fe1f56f5162C75C' as Address,
    partnerDeposit: BigNumber.from(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.settleable,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: BigNumber.from(10 ** 8),
    balance: constants.Zero,
    capacity: BigNumber.from(10 ** 8),
    ownWithdrawable: BigNumber.from(10 ** 8),
  } as RaidenChannel;

  static closedChannel = {
    id: 281,
    openBlock: 1000,
    closeBlock: 1750,
    partner: '0x2046F7341f15D0211ca1EBeFb19d029c4Bc4c4e7' as Address,
    partnerDeposit: BigNumber.from(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.closed,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: BigNumber.from(10 ** 8),
    balance: constants.Zero,
    capacity: BigNumber.from(10 ** 8),
    ownWithdrawable: BigNumber.from(10 ** 8),
  } as RaidenChannel;

  static mockChannelArray = [
    TestData.openChannel,
    TestData.settlingChannel,
    TestData.settlableChannel,
    TestData.closedChannel,
  ];

  static mockChannels: RaidenChannels = {
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {
      '0x1D36124C90f53d491b6832F1c073F43E2550E35b': TestData.openChannel,
      '0x82641569b2062B545431cF6D7F0A418582865ba7': TestData.settlingChannel,
    },
  };

  static mockTokens: Tokens = {
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {
      address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      decimals: 5,
      balance: utils.parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
  };

  static mockRoute(
    params: Record<string, string> = {},
    meta: Record<string, unknown> = {},
    name: string = RouteNames.HOME,
  ): Route {
    return {
      path: '',
      fullPath: '',
      matched: [],
      hash: '',
      params,
      query: {},
      name: name,
      meta: meta,
    };
  }

  static mockDirectTransfer: Transfer = {
    target: '0x09123456789',
    hops: 0,
    transferAmount: BigNumber.from(10 ** 8),
    transferToken: {
      address: '0xtoken',
      decimals: 5,
      balance: utils.parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
    transferTotal: BigNumber.from(10 ** 8),
    paymentId,
  };

  static mockMediatedTransfer: Transfer = {
    target: '0x09123456789',
    transferAmount: BigNumber.from(10 ** 8),
    transferToken: {
      address: '0xtoken',
      decimals: 5,
      balance: utils.parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
    transferTotal: BigNumber.from(10 ** 8),
    hops: 1,
    mediationFee: BigNumber.from(10 ** 4),
    serviceFee: BigNumber.from(10 ** 4),
    serviceToken: {
      address: '0xtoken',
      decimals: 5,
      balance: utils.parseUnits('1.2', 5),
      name: 'Service Token',
      symbol: 'SVT',
    } as Token,
    pfsAddress: 'https://pfsadr.org',
    paymentId,
  };

  static notifications: NotificationPayload = {
    id: 1,
    title: 'Channel Settlement',
    description: 'Channel with 0x09123456789 was settled.',
    icon: 'notification_settle',
    link: 'Visit the Withdrawal menu',
    dappRoute: RouteNames.ACCOUNT_WITHDRAWAL,
    display: true,
    duration: 5000,
    importance: NotificationImportance.HIGH,
    context: NotificationContext.NONE,
    received: new Date('June 5, 1986'),
    txConfirmationBlock: 123,
    txHash: '0xTxHash',
  };
}
