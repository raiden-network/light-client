import { createStandardAction } from 'typesafe-actions';

import { Address, UInt } from '../utils/types';
import { Metadata } from '../messages/types';

type PathId = {
  tokenNetwork: Address;
  target: Address;
  value: UInt<32>;
};

export const pathFind = createStandardAction('pathFind')<{ metadata?: Metadata }, PathId>();

export const pathFound = createStandardAction('pathFound')<{ metadata: Metadata }, PathId>();

export const pathFindFailed = createStandardAction('pathFindFailed').map(
  (payload: Error, meta: PathId) => ({ payload, error: true, meta }),
);
