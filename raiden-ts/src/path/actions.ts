/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { createAction, ActionType } from '../utils/actions';
import { Address, UInt, Signed, ErrorCodec } from '../utils/types';
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

export const pathFind = createAction(
  'pathFind',
  t.partial({ paths: Paths, pfs: t.union([PFS, t.null]) }),
  PathId,
);
export interface pathFind extends ActionType<typeof pathFind> {}

export const pathFound = createAction('pathFound', t.type({ paths: Paths }), PathId);
export interface pathFound extends ActionType<typeof pathFound> {}

export const pathFindFailed = createAction('pathFindFailed', ErrorCodec, PathId, true);
export interface pathFindFailed extends ActionType<typeof pathFindFailed> {}

export const pfsListUpdated = createAction(
  'pfsListUpdated',
  t.type({ pfsList: t.readonlyArray(Address) }),
);
export interface pfsListUpdated extends ActionType<typeof pfsListUpdated> {}

export const iouPersist = createAction('iouPersist', t.type({ iou: Signed(IOU) }), ServiceId);
export interface iouPersist extends ActionType<typeof iouPersist> {}

export const iouClear = createAction('iouClear', undefined, ServiceId);
export interface iouClear extends ActionType<typeof iouClear> {}
