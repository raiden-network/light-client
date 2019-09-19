import { BigNumber, parseUnits, formatUnits, formatEther } from 'ethers/utils';

export class BalanceUtils {
  static toEth(wei: BigNumber): string {
    return formatEther(wei);
  }

  static toUnits(wei: BigNumber, decimals: number): string {
    return formatUnits(wei, decimals);
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
    return parseUnits(deposit, decimals);
  }
}
