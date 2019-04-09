import { Token } from '@/model/types';
import { ethers } from 'ethers';
import { BigNumber } from 'ethers/utils';
import { ChannelState, RaidenChannel, RaidenChannels } from 'raiden';

export class TestData {
  static token: Token = {
    address: '0xtoken',
    decimals: 5,
    balance: ethers.utils.parseUnits('1.2', 5),
    units: '1.2',
    name: 'TestToken',
    symbol: 'TTT'
  };

  static mockChannel1: RaidenChannel = {
    id: 278,
    openBlock: 10582255,
    partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b',
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    totalDeposit: new BigNumber(10 ** 8)
  };

  static mockChannel2: RaidenChannel = {
    id: 279,
    openBlock: 10585255,
    partner: '0x82641569b2062B545431cF6D7F0A418582865ba7',
    partnerDeposit: new BigNumber(10 ** 8),
    settleTimeout: 500,
    state: ChannelState.open,
    token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    tokenNetwork: '0x111157460c0F41EfD9107239B7864c062aA8B978',
    totalDeposit: new BigNumber(10 ** 8)
  };

  static mockChannelArray = [TestData.mockChannel1, TestData.mockChannel2];

  static mockChannels: RaidenChannels = {
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {
      '0x1D36124C90f53d491b6832F1c073F43E2550E35b': TestData.mockChannel1,
      '0x82641569b2062B545431cF6D7F0A418582865ba7': TestData.mockChannel2
    }
  };
}
