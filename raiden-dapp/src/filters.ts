import Vue from 'vue';
import { BigNumber } from 'ethers/utils';
import { BalanceUtils, getDecimals } from '@/utils/balance-utils';
import split from 'lodash/split';
import capitalize from 'lodash/capitalize';

export default class Filters {
  static truncate(value: string, width: number = 12) {
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
    const numberOfDecimals = getDecimals(decimals);
    const units = BalanceUtils.toUnits(amount, numberOfDecimals);
    const deposit = parseFloat(units);
    if (deposit === 0) {
      return numberOfDecimals === 0 ? '0' : '0.0';
    } else if (deposit < 0.000001) {
      return '<0.000001';
    } else {
      const [integerPart, decimalPart] = split(units, '.');

      if (decimalPart && decimalPart.length > 6) {
        let newDecimal = decimalPart.substring(0, 6);
        return `≈${integerPart}.${newDecimal}`;
      } else {
        return decimals === 0 ? integerPart : units;
      }
    }
  }

  static capitalizeFirst(value: string): string {
    return capitalize(value);
  }

  static toUnits = (wei: BigNumber, decimals?: number) =>
    BalanceUtils.toUnits(wei, getDecimals(decimals));

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
