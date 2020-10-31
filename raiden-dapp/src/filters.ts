import Vue from 'vue';
import { BigNumber } from 'ethers';
import { BalanceUtils } from '@/utils/balance-utils';
import split from 'lodash/split';
import capitalize from 'lodash/capitalize';

export default class Filters {
  static truncate(value?: string, width: number = 12) {
    if (!value) {
      return '';
    }
    const separator = '...';
    if (value.length <= width) {
      return value;
    } else {
      const substWidth = Math.floor(width / 2);
      return (
        value.substr(0, substWidth) +
        separator +
        value.substr(value.length - substWidth)
      );
    }
  }

  static decimals(value: string, decimals: number = 3) {
    return parseFloat(value).toFixed(decimals);
  }

  static upper(value?: string) {
    if (!value) {
      return '';
    }
    return value.toLocaleUpperCase();
  }

  static displayFormat(amount: BigNumber, decimals?: number): string {
    const units = BalanceUtils.toUnits(amount, decimals ?? 18);
    const deposit = parseFloat(units);
    if (deposit === 0) {
      return decimals === 0 ? '0' : '0.0';
    } else if (deposit < 0.000001) {
      return '<0.000001';
    } else {
      return Filters.formatValue(units, decimals);
    }
  }

  private static formatValue(units: string, decimals: number | undefined) {
    const [integerPart, decimalPart] = split(units, '.');

    if (decimalPart && decimalPart.length > 6) {
      const newDecimal = decimalPart.substring(0, 6);
      return `≈${integerPart}.${newDecimal}`;
    } else {
      return decimals === 0 ? integerPart : units;
    }
  }

  static capitalizeFirst(value: string): string {
    return capitalize(value);
  }

  static toUnits = (wei: BigNumber, decimals?: number) =>
    BalanceUtils.toUnits(wei, decimals ?? 18);

  static formatDate = (value: Date): string => {
    return `${new Intl.DateTimeFormat('en-US').format(
      value
    )} ${value.toLocaleTimeString('en-US')}`;
  };
}

Vue.filter('truncate', Filters.truncate);
Vue.filter('decimals', Filters.decimals);
Vue.filter('upper', Filters.upper);
Vue.filter('displayFormat', Filters.displayFormat);
Vue.filter('capitalizeFirst', Filters.capitalizeFirst);
Vue.filter('toUnits', Filters.toUnits);
Vue.filter('formatDate', Filters.formatDate);
