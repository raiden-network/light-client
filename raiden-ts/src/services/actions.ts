/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, UInt, Signed } from '../utils/types';
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
  'pfsListUpdated',
  t.type({ pfsList: t.readonlyArray(Address) }),
);
export interface pfsListUpdated extends ActionType<typeof pfsListUpdated> {}

export const iouPersist = createAction('iouPersist', t.type({ iou: Signed(IOU) }), ServiceId);
export interface iouPersist extends ActionType<typeof iouPersist> {}

export const iouClear = createAction('iouClear', undefined, ServiceId);
export interface iouClear extends ActionType<typeof iouClear> {}

export const udcDeposited = createAction('udcDeposited', UInt(32));
export interface udcDeposited extends ActionType<typeof udcDeposited> {}
