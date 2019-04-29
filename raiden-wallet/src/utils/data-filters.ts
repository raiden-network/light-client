import { Token } from '@/model/types';
import _ from 'lodash';

export default class DataFilters {
  static filterToken(token: Token, queryText: string): boolean {
    const query = queryText.toLocaleLowerCase();
    const symbolMatches =
      !!token.symbol && _.startsWith(token.symbol.toLocaleLowerCase(), query);
    const addressMatches =
      token.address.toLocaleLowerCase().indexOf(query) > -1;
    const nameMatches =
      !!token.name && token.name.toLocaleLowerCase().indexOf(query) > -1;

    return symbolMatches || addressMatches || nameMatches;
  }
}
