import { createStandardAction } from 'typesafe-actions';

import { Address } from '../utils/types';
import { RaidenMatrixSetup } from './state';

/* MatrixClient instance is ready and logged in to payload.server with credentials payload.setup */
export const matrixSetup = createStandardAction('matrixSetup')<{
  server: string;
  setup: RaidenMatrixSetup;
}>();

/* Request matrix to start monitoring presence updates for meta.address */
export const matrixRequestMonitorPresence = createStandardAction('matrixRequestMonitorPresence')<
  undefined,
  { address: Address }
>();

/**
 * Monitored user meta.address presence updated.
 * First event for this address also works as 'success' for matrixRequestMonitorPresence
 */
export const matrixPresenceUpdate = createStandardAction(
  'matrixPresenceUpdate',
).map(
  (
    { userId, available, ts }: { userId: string; available: boolean; ts?: number },
    meta: { address: Address },
  ) => ({ payload: { userId, available, ts: ts || Date.now() }, meta }),
);

/* A matrixRequestMonitorPresence request action (with meta.address) failed with payload=Error */
export const matrixRequestMonitorPresenceFailed = createStandardAction(
  'matrixRequestMonitorPresenceFailed',
).map((payload: Error, meta: { address: Address }) => ({ payload, error: true, meta }));

/* payload.roomId must go front on meta.address's room queue */
export const matrixRoom = createStandardAction('matrixRoom')<
  { roomId: string },
  { address: Address }
>();

/* payload.roomId must be excluded from meta.address room queue, if present */
export const matrixRoomLeave = createStandardAction('matrixRoomLeave')<
  { roomId: string },
  { address: Address }
>();
