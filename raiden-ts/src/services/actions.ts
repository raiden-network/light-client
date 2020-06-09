/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, UInt, Signed, Hash } from '../utils/types';
import { Paths, PFS, IOU } from './types';

const PathId = t.type({
  tokenNetwork: Address,
  target: Address,
  value: UInt(32),
});

const ServiceId = t.type({
  tokenNetwork: Address,
  serviceAddress: Address,
});

export const pathFind = createAsyncAction(
  PathId,
  'path/find/request',
  'path/find/success',
  'path/find/failure',
  t.partial({ paths: Paths, pfs: t.union([PFS, t.null]) }),
  t.type({ paths: Paths }),
);

export namespace pathFind {
  export interface request extends ActionType<typeof pathFind.request> {}
  export interface success extends ActionType<typeof pathFind.success> {}
  export interface failure extends ActionType<typeof pathFind.failure> {}
}

export const pfsListUpdated = createAction(
  'pfs/list/updated',
  t.type({ pfsList: t.readonlyArray(Address) }),
);
export interface pfsListUpdated extends ActionType<typeof pfsListUpdated> {}

export const iouPersist = createAction('iou/persist', t.type({ iou: Signed(IOU) }), ServiceId);
export interface iouPersist extends ActionType<typeof iouPersist> {}

export const iouClear = createAction('iou/clear', undefined, ServiceId);
export interface iouClear extends ActionType<typeof iouClear> {}

export const udcDeposited = createAction('udc/deposited', UInt(32));
export interface udcDeposited extends ActionType<typeof udcDeposited> {}

export const udcWithdraw = createAsyncAction(
  t.partial({}),
  'udc/withdraw/request',
  'udc/withdraw/success',
  'udc/withdraw/failure',
  t.type({ amount: UInt(32) }),
  t.type({ txHash: Hash, amount: UInt(32) }),
);

export namespace udcWithdraw {
  export interface request extends ActionType<typeof udcWithdraw.request> {}
  export interface success extends ActionType<typeof udcWithdraw.success> {}
  export interface failure extends ActionType<typeof udcWithdraw.failure> {}
}

export const udcWithdrawPlanned = createAction(
  'udc/withdraw/planned',
  t.type({ amount: UInt(32), block: UInt(32) }),
  t.partial({ txHash: Hash }),
);

export interface udcWithdrawPlanned extends ActionType<typeof udcWithdrawPlanned> {}
