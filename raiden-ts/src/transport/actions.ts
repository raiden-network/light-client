/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, instanceOf } from '../utils/types';
import { RaidenMatrixSetup } from './state';

const NodeId = t.type({ address: Address });

/* MatrixClient instance is ready and logged in to payload.server with credentials payload.setup */
export const matrixSetup = createAction(
  'matrixSetup',
  t.type({
    server: t.string,
    setup: RaidenMatrixSetup,
  }),
);
export interface matrixSetup extends ActionType<typeof matrixSetup> {}

export const matrixPresence = createAsyncAction(
  NodeId,
  'matrix/presence/request',
  'matrix/presence/success',
  'matrix/presence/failure',
  undefined,
  t.intersection([
    t.type({ userId: t.string, available: t.boolean, ts: t.number }),
    t.partial({ caps: t.record(t.string, t.any) }),
  ]),
);

export namespace matrixPresence {
  export interface request extends ActionType<typeof matrixPresence.request> {}
  export interface success extends ActionType<typeof matrixPresence.success> {}
  export interface failure extends ActionType<typeof matrixPresence.failure> {}
}

/* payload.roomId must go front on meta.address's room queue */
export const matrixRoom = createAction('matrixRoom', t.type({ roomId: t.string }), NodeId);
export interface matrixRoom extends ActionType<typeof matrixRoom> {}

/* payload.roomId must be excluded from meta.address room queue, if present */
export const matrixRoomLeave = createAction(
  'matrixRoomLeave',
  t.type({ roomId: t.string }),
  NodeId,
);
export interface matrixRoomLeave extends ActionType<typeof matrixRoomLeave> {}

export const rtcChannel = createAction(
  'rtcChannel',
  t.union([t.undefined, instanceOf(RTCDataChannel)]),
  NodeId,
);
export interface rtcChannel extends ActionType<typeof rtcChannel> {}
