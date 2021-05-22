/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { ServiceC } from '../services/types';
import { Via } from '../transport/types';
import type { ActionType } from '../utils/actions';
import { createAction, createAsyncAction } from '../utils/actions';
import { Address, Signed } from '../utils/types';
import { Message } from './types';

/**
 * One-shot send payload.message to meta.address user in transport
 */
export const messageSend = createAsyncAction(
  t.type({ address: Address, msgId: t.string }),
  'message/send/request',
  'message/send/success',
  'message/send/failure',
  t.intersection([
    t.type({ message: t.union([t.string, Signed(Message)]) }),
    t.partial({ msgtype: t.string }),
    Via,
  ]),
  t.union([t.undefined, t.type({ via: t.string, tookMs: t.number, retries: t.number })]),
);
export namespace messageSend {
  export interface request extends ActionType<typeof messageSend.request> {}
  export interface success extends ActionType<typeof messageSend.success> {}
  export interface failure extends ActionType<typeof messageSend.failure> {}
}

/** One-shot send payload.message to a service room in transport */
export const messageServiceSend = createAsyncAction(
  t.type({ service: ServiceC, msgId: t.string }),
  'message/service/send/request',
  'message/service/send/success',
  'message/service/send/failure',
  t.type({ message: Signed(Message) }),
  t.union([t.undefined, t.type({ via: t.unknown, tookMs: t.number, retries: t.number })]),
);
export namespace messageServiceSend {
  export interface request extends ActionType<typeof messageServiceSend.request> {}
  export interface success extends ActionType<typeof messageServiceSend.success> {}
  export interface failure extends ActionType<typeof messageServiceSend.failure> {}
}

/**
 * payload.message was received on payload.ts (timestamp) from meta.address
 * payload.userId is optional and specific to matrix transport, as sender info
 */
export const messageReceived = createAction(
  'message/received',
  t.intersection([
    t.type({
      text: t.string,
      ts: t.number,
    }),
    t.partial({
      message: t.union([Message, Signed(Message)]),
      userId: t.string,
      msgtype: t.string,
    }),
  ]),
  t.type({ address: Address }),
);
export interface messageReceived extends ActionType<typeof messageReceived> {}
