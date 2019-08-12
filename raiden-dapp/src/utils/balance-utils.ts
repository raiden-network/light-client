import { BigNumber } from 'ethers/utils';
import { utils } from 'ethers';
import { Token } from '@/model/types';

export class BalanceUtils {
  static toEth(wei: BigNumber): string {
    return utils.formatEther(wei);
  }

  static toUnits(wei: BigNumber, decimals: number): string {
    return utils.formatUnits(wei, decimals);
  }

  static decimalsOverflow(depositTokens: string, decimals: number): boolean {
    let decimalPart: string;
    if (depositTokens.indexOf('.') > 0) {
      decimalPart = depositTokens.split('.')[1];
    } else {
      decimalPart = '';
    }
    return decimalPart.length > decimals;
  }

  static parse(deposit: string, decimals: number) {
    return utils.parseUnits(deposit, decimals);
  }
}
