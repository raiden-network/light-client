import { BigNumber, parseUnits, formatUnits, formatEther } from 'ethers/utils';

export class BalanceUtils {
  static toEth(wei: BigNumber): string {
    return formatEther(wei);
  }

  static toUnits(wei: BigNumber, decimals: number): string {
    const units = formatUnits(wei, decimals);
    if (decimals === 0) {
      return units.split('.')[0];
    }
    return units;
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
    return parseUnits(
      deposit.endsWith('.')
        ? deposit.substring(0, deposit.length - 1)
        : deposit,
      decimals
    );
  }
}

export function getDecimals(decimals?: number) {
  if (decimals === undefined) {
    return 18;
  }
  return decimals;
}
