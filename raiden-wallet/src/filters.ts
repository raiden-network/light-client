import Vue from 'vue';
import { BigNumber } from 'ethers/utils';
import { BalanceUtils } from '@/utils/balance-utils';
import _ from 'lodash';
import { Filter } from 'ethers/providers';

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

  static upper(value: string) {
    if (!value) {
      return '';
    }
    return value.toLocaleUpperCase();
  }

  static displayFormat(amount: BigNumber, decimals: number): string {
    const units = BalanceUtils.toUnits(amount, decimals);
    if (parseFloat(units) < 0.00001) {
      return '<0.00001';
    } else {
      const split = _.split(units, '.');
      if (split[1] && split[1].length > 5) {
        return units.substr(0, units.indexOf('.') + 6);
      } else {
        return units;
      }
    }
  }

  static capitalizeFirst(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.substr(1);
  }
}

Vue.filter('truncate', Filters.truncate);
Vue.filter('decimals', Filters.decimals);
Vue.filter('upper', Filters.upper);
Vue.filter('displayFormat', Filters.displayFormat);
Vue.filter('capitalizeFirst', Filters.capitalizeFirst);
