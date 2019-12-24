/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { createAction, ActionType } from '../utils/actions';
import { Address, ErrorCodec } from '../utils/types';
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

/* Request matrix to start monitoring presence updates for meta.address */
export const matrixRequestMonitorPresence = createAction(
  'matrixRequestMonitorPresence',
  undefined,
  NodeId,
);
export interface matrixRequestMonitorPresence
  extends ActionType<typeof matrixRequestMonitorPresence> {}

/**
 * Monitored user meta.address presence updated.
 * First event for this address also works as 'success' for matrixRequestMonitorPresence
 */
export const matrixPresenceUpdate = createAction(
  'matrixPresenceUpdate',
  t.type({ userId: t.string, available: t.boolean, ts: t.number }),
  NodeId,
);
export interface matrixPresenceUpdate extends ActionType<typeof matrixPresenceUpdate> {}

/* A matrixRequestMonitorPresence request action (with meta.address) failed with payload=Error */
export const matrixRequestMonitorPresenceFailed = createAction(
  'matrixRequestMonitorPresenceFailed',
  ErrorCodec,
  NodeId,
  true,
);
export interface matrixRequestMonitorPresenceFailed
  extends ActionType<typeof matrixRequestMonitorPresenceFailed> {}

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
