import { createStandardAction } from 'typesafe-actions';

import { Message } from './types';
import { Address, Signed } from '../utils/types';

/** One-shot send payload.message to meta.address user in transport */
export const messageSend = createStandardAction('messageSend')<
  { message: string | Signed<Message> },
  { address: Address }
>();

/**
 * Success action when message is actually sent
 * messageSend doesn't fail (except unexpectedly, like network errors), instead just hang there
 * until a suitable set of conditions is met, i.e.: there's a room for recipient's address, an
 * online validated user for this address, and it had joined that room, then the message is sent
 * and this success action is emitted. 'payload.message' and 'meta.address' should be kept strictly
 * equal to messageSend (even by reference, in case of Message), to ease filtering.
 * Useful to control retry without queueing multiple identical messages while the first is still
 * pending
 */
export const messageSent = createStandardAction('messageSent')<
  { message: string | Signed<Message> },
  { address: Address }
>();

/** One-shot send payload.message to a global room in transport */
export const messageGlobalSend = createStandardAction('messageGlobalSend')<
  { message: string | Signed<Message> },
  { roomName: string }
>();

/**
 * payload.message was received on payload.ts (timestamp) from meta.address
 * payload.userId and payload.roomId are optional and specific to matrix transport, as sender info
 */
export const messageReceived = createStandardAction('messageReceived').map(
  (
    {
      text,
      message,
      ts,
      userId,
      roomId,
    }: {
      text: string;
      message?: Signed<Message>;
      ts?: number;
      userId?: string;
      roomId?: string;
    },
    meta: { address: Address },
  ) => ({ payload: { text, message, ts: ts || Date.now(), userId, roomId }, meta }),
);
