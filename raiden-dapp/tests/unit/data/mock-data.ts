import { Token, Transfer } from '@/model/types';
import { parseUnits, BigNumber } from 'ethers/utils';

import { Zero } from 'ethers/constants';
import {
  Address,
  ChannelState,
  RaidenChannel,
  RaidenChannels,
} from 'raiden-ts';
import { Route } from 'vue-router';
import { RouteNames } from '@/router/route-names';
import { Tokens } from '@/types';
import { Notification } from '@/store/notifications/types';

export const paymentId = new BigNumber(4444);

export class TestData {
  static token: Token = {
    address: '0xtoken',
    decimals: 5,
    balance: parseUnits('1.2', 5),
    name: 'TestToken',
    symbol: 'TTT',
  };

  static openChannel: RaidenChannel = {
    id: 278,
    openBlock: 10582255,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b' as Address,
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero,
    capacity: new BigNumber(10 ** 8),
  };

  static settlingChannel: RaidenChannel = {
    id: 279,
    openBlock: 10585255,
    partner: '0x82641569b2062B545431cF6D7F0A418582865ba7' as Address,
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.settling,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero,
    capacity: new BigNumber(10 ** 8),
  };

  static settlableChannel: RaidenChannel = {
    id: 280,
    openBlock: 10585255,
    partner: '0x504300C525CbE91Adb3FE0944Fe1f56f5162C75C' as Address,
    partnerDeposit: new BigNumber(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.settleable,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero,
    capacity: new BigNumber(10 ** 8),
  };

  static closedChannel: RaidenChannel = {
    id: 281,
    openBlock: 10585255,
    partner: '0x2046F7341f15D0211ca1EBeFb19d029c4Bc4c4e7' as Address,
    partnerDeposit: new BigNumber(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.closed,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C' as Address,
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978' as Address,
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero,
    capacity: new BigNumber(10 ** 8),
  };

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
      balance: parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
  };

  static mockRoute(
    params: {} = {},
    meta: {} = {},
    name: string = RouteNames.HOME
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
    transferAmount: new BigNumber(10 ** 8),
    transferToken: {
      address: '0xtoken',
      decimals: 5,
      balance: parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
    transferTotal: new BigNumber(10 ** 8),
    paymentId,
  };

  static mockMediatedTransfer: Transfer = {
    target: '0x09123456789',
    transferAmount: new BigNumber(10 ** 8),
    transferToken: {
      address: '0xtoken',
      decimals: 5,
      balance: parseUnits('1.2', 5),
      name: 'TestToken',
      symbol: 'TTT',
    } as Token,
    transferTotal: new BigNumber(10 ** 8),
    hops: 1,
    mediationFee: new BigNumber(10 ** 4),
    serviceFee: new BigNumber(10 ** 4),
    serviceToken: {
      address: '0xtoken',
      decimals: 5,
      balance: parseUnits('1.2', 5),
      name: 'Service Token',
      symbol: 'SVT',
    } as Token,
    pfsAddress: 'https://pfsadr.org',
    paymentId,
  };

  static notifications: Notification = {
    id: 1,
    title: 'BALANCE PROOF SUBMITTED',
    description: 'The monitoring service has submitted a balance proof.',
    received: new Date('June 5, 1986'),
  };
}
