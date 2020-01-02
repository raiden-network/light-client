/* eslint-disable @typescript-eslint/class-name-casing */
/**
 * Aggregate types and exported properties from actions from all modules
 */
import * as t from 'io-ts';

import { ShutdownReason } from './constants';
import { PartialRaidenConfig } from './config';
import { ActionType, createAction, Action } from './utils/actions';
import { ErrorCodec } from './utils/types';

import * as ChannelsActions from './channels/actions';
import * as TransportActions from './transport/actions';
import * as MessagesActions from './messages/actions';
import * as TransfersActions from './transfers/actions';
import * as PathFindActions from './path/actions';

export const raidenShutdown = createAction(
  'raidenShutdown',
  t.type({
    reason: t.union([
      t.literal(ShutdownReason.STOP),
      t.literal(ShutdownReason.ACCOUNT_CHANGED),
      t.literal(ShutdownReason.NETWORK_CHANGED),
      ErrorCodec,
    ]),
  }),
);
export interface raidenShutdown extends ActionType<typeof raidenShutdown> {}

export const raidenConfigUpdate = createAction(
  'raidenConfigUpdate',
  t.type({ config: PartialRaidenConfig }),
);
export interface raidenConfigUpdate extends ActionType<typeof raidenConfigUpdate> {}

const RaidenActions = {
  raidenShutdown,
  raidenConfigUpdate,
  ...ChannelsActions,
  ...TransportActions,
  ...MessagesActions,
  ...TransfersActions,
  ...PathFindActions,
};

/* Tagged union of all action types from the action creators */
// export type RaidenAction = ActionType<typeof RaidenActions>;
export type RaidenAction = Action;

/* Mapping { [type: string]: Action } of a subset of RaidenActions exposed as events */
export const RaidenEvents = [
  RaidenActions.raidenShutdown,
  RaidenActions.newBlock,
  RaidenActions.matrixPresence.success,
  RaidenActions.tokenMonitored,
];
/* Tagged union of RaidenEvents actions */
export type RaidenEvent = ActionType<typeof RaidenEvents>;
