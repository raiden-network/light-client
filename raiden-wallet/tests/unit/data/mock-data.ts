import { Token } from '@/model/token';
import { ethers } from 'ethers';

export class TestData {
  static token: Token = {
    address: '0xtoken',
    decimals: 5,
    balance: ethers.utils.parseUnits('1.2', 5),
    units: '1.2',
    name: 'TestToken',
    symbol: 'TTT'
  };
}
