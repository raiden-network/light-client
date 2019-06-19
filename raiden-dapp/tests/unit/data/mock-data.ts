import { Token } from '@/model/types';
import { ethers } from 'ethers';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import { ChannelState, RaidenChannel, RaidenChannels } from 'raiden';
import { Route } from 'vue-router';

export class TestData {
  static token: Token = {
    address: '0xtoken',
    decimals: 5,
    balance: ethers.utils.parseUnits('1.2', 5),
    units: '1.2',
    name: 'TestToken',
    symbol: 'TTT'
  };

  static openChannel: RaidenChannel = {
    id: 278,
    openBlock: 10582255,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b',
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero
  };

  static settlingChannel: RaidenChannel = {
    id: 279,
    openBlock: 10585255,
    partner: '0x82641569b2062B545431cF6D7F0A418582865ba7',
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.settling,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero
  };

  static settlableChannel: RaidenChannel = {
    id: 280,
    openBlock: 10585255,
    partner: '0x504300C525CbE91Adb3FE0944Fe1f56f5162C75C',
    partnerDeposit: new BigNumber(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.settleable,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero
  };

  static closedChannel: RaidenChannel = {
    id: 281,
    openBlock: 10585255,
    partner: '0x2046F7341f15D0211ca1EBeFb19d029c4Bc4c4e7',
    partnerDeposit: new BigNumber(11 ** 8),
    settleTimeout: 500,
    state: ChannelState.closed,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    ownDeposit: new BigNumber(10 ** 8),
    balance: Zero
  };

  static mockChannelArray = [
    TestData.openChannel,
    TestData.settlingChannel,
    TestData.settlableChannel,
    TestData.closedChannel
  ];

  static mockChannels: RaidenChannels = {
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {
      '0x1D36124C90f53d491b6832F1c073F43E2550E35b': TestData.openChannel,
      '0x82641569b2062B545431cF6D7F0A418582865ba7': TestData.settlingChannel
    }
  };

  static mockRoute(params: {} = {}): Route {
    return {
      path: '',
      fullPath: '',
      matched: [],
      hash: '',
      params,
      query: {}
    };
  }
}
