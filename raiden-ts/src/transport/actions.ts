/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import type { ActionType } from '../utils/actions';
import { createAction, createAsyncAction } from '../utils/actions';
import { Address, instanceOf, PublicKey } from '../utils/types';
import { RaidenMatrixSetup } from './state';
import { Caps } from './types';

const NodeId = t.type({ address: Address });

/* MatrixClient instance is ready and logged in to payload.server with credentials payload.setup */
export const matrixSetup = createAction(
  'matrix/setup',
  t.type({
    server: t.string,
    setup: RaidenMatrixSetup,
  }),
);
export interface matrixSetup extends ActionType<typeof matrixSetup> {}

export const matrixPresence = createAsyncAction(
  NodeId,
  'matrix/presence',
  undefined,
  t.intersection([
    t.type({ userId: t.string, available: t.boolean, ts: t.number, pubkey: PublicKey }),
    t.partial({ caps: Caps }),
  ]),
);
export namespace matrixPresence {
  export interface request extends ActionType<typeof matrixPresence.request> {}
  export interface success extends ActionType<typeof matrixPresence.success> {}
  export interface failure extends ActionType<typeof matrixPresence.failure> {}
}

export const rtcChannel = createAction(
  'rtc/channel',
  t.union([t.undefined, instanceOf<RTCDataChannel>('RTCDataChannel')]),
  NodeId,
);
export interface rtcChannel extends ActionType<typeof rtcChannel> {}
