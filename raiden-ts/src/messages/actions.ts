/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { Message } from './types';
import { createAction, ActionType } from '../utils/actions';
import { Address, Signed } from '../utils/types';

/** One-shot send payload.message to meta.address user in transport */
export const messageSend = createAction(
  'messageSend',
  t.type({ message: t.union([t.string, Signed(Message)]) }),
  t.type({ address: Address }),
);
export interface messageSend extends ActionType<typeof messageSend> {}

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
export const messageSent = createAction(
  'messageSent',
  t.type({ message: t.union([t.string, Signed(Message)]) }),
  t.type({ address: Address }),
);
export interface messageSent extends ActionType<typeof messageSent> {}

/** One-shot send payload.message to a global room in transport */
export const messageGlobalSend = createAction(
  'messageGlobalSend',
  t.type({ message: t.union([t.string, Signed(Message)]) }),
  t.type({ roomName: t.string }),
);
export interface messageGlobalSend extends ActionType<typeof messageGlobalSend> {}

/**
 * payload.message was received on payload.ts (timestamp) from meta.address
 * payload.userId and payload.roomId are optional and specific to matrix transport, as sender info
 */
export const messageReceived = createAction(
  'messageReceived',
  t.intersection([
    t.type({
      text: t.string,
      ts: t.number,
    }),
    t.partial({
      message: Signed(Message),
      userId: t.string,
      roomId: t.string,
    }),
  ]),

  t.type({ address: Address }),
);
export interface messageReceived extends ActionType<typeof messageReceived> {}
