/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { Message } from './types';
import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, Signed } from '../utils/types';

/** One-shot send payload.message to meta.address user in transport */
export const messageSend = createAsyncAction(
  t.type({ address: Address, msgId: t.string }),
  'message/send/request',
  'message/send/success',
  'message/send/failure',
  t.type({ message: t.union([t.string, Signed(Message)]) }),
  undefined,
);
export namespace messageSend {
  export interface request extends ActionType<typeof messageSend.request> {}
  export interface success extends ActionType<typeof messageSend.success> {}
  export interface failure extends ActionType<typeof messageSend.failure> {}
}

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
