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

  static hasBalance(depositTokens: string, token: Token): boolean {
    const deposit = BalanceUtils.parse(depositTokens, token.decimals);
    const balance = BalanceUtils.parse(token.units, token.decimals);
    return deposit.lte(balance);
  }

  static decimalsOverflow(depositTokens: string, token: Token): boolean {
    let decimalPart: string;
    if (depositTokens.indexOf('.') > 0) {
      decimalPart = depositTokens.split('.')[1];
    } else if (depositTokens.indexOf(',') > 0) {
      decimalPart = depositTokens.split(',')[1];
    } else {
      decimalPart = '';
    }
    return decimalPart.length > token.decimals;
  }

  static parse(deposit: string, decimals: number) {
    return utils.parseUnits(deposit, decimals);
  }
}
