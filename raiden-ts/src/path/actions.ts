import { createStandardAction } from 'typesafe-actions';

import { Address, UInt, Signed } from '../utils/types';
import { Paths, PFS, IOU } from './types';

type PathId = {
  tokenNetwork: Address;
  target: Address;
  value: UInt<32>;
};

type ServiceId = {
  tokenNetwork: Address;
  serviceAddress: Address;
};

export const pathFind = createStandardAction('pathFind')<{ paths?: Paths; pfs?: PFS }, PathId>();

export const pathFound = createStandardAction('pathFound')<{ paths: Paths }, PathId>();

export const pathFindFailed = createStandardAction('pathFindFailed').map(
  (payload: Error, meta: PathId) => ({ payload, error: true, meta }),
);

export const pfsListUpdated = createStandardAction('pfsListUpdated')<{
  pfsList: readonly Address[];
}>();

export const persistIOU = createStandardAction('persistIOU')<
  {
    iou: Signed<IOU>;
  },
  ServiceId
>();

export const clearIOU = createStandardAction('clearIOU')<undefined, ServiceId>();
