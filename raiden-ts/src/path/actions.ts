import { createStandardAction } from 'typesafe-actions';

import { Address, UInt } from '../utils/types';
import { Paths, PFS } from './types';

type PathId = {
  tokenNetwork: Address;
  target: Address;
  value: UInt<32>;
};

export const pathFind = createStandardAction('pathFind')<{ paths?: Paths; pfs?: PFS }, PathId>();

export const pathFound = createStandardAction('pathFound')<{ paths: Paths }, PathId>();

export const pathFindFailed = createStandardAction('pathFindFailed').map(
  (payload: Error, meta: PathId) => ({ payload, error: true, meta }),
);

export const pfsListUpdated = createStandardAction('pfsListUpdated')<{
  pfsList: readonly Address[];
}>();

export const udcBalanceFetch = createStandardAction('udcBalanceFetch')<{}>();

export const udcBalanceUpdate = createStandardAction('udcBalanceUpdate')<{
  balance: UInt<32>;
}>();

export const udcBalanceFetchFailed = createStandardAction('udcBalanceFetchFailed').map(
  (payload: Error) => ({ payload, error: true }),
);
