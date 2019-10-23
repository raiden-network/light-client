import { createStandardAction } from 'typesafe-actions';

import { Address, UInt } from '../utils/types';
import { Paths } from './types';

type PathId = {
  tokenNetwork: Address;
  target: Address;
  value: UInt<32>;
};

export const pathFind = createStandardAction('pathFind')<{ paths?: Paths }, PathId>();

export const pathFound = createStandardAction('pathFound')<{ paths: Paths }, PathId>();

export const pathFindFailed = createStandardAction('pathFindFailed').map(
  (payload: Error, meta: PathId) => ({ payload, error: true, meta }),
);

export const pfsListUpdated = createStandardAction('pfsListUpdated')<{ pfsList: Address[] }>();
