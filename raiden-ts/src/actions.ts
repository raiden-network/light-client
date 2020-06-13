/**
 * Aggregate types and exported properties from actions from all modules
 */
import * as t from 'io-ts';

import { ShutdownReason } from './constants';
import { PartialRaidenConfig } from './config';
import { ActionType, createAction, Action } from './utils/actions';
import { ErrorCodec } from './utils/error';
import { Hash } from './utils/types';

import * as ChannelsActions from './channels/actions';
import * as TransportActions from './transport/actions';
import * as MessagesActions from './messages/actions';
import * as TransfersActions from './transfers/actions';
import * as ServicesActions from './services/actions';

export const raidenShutdown = createAction(
  'raiden/shutdown',
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

export const raidenConfigUpdate = createAction('raiden/config/update', PartialRaidenConfig);
export interface raidenConfigUpdate extends ActionType<typeof raidenConfigUpdate> {}

const RaidenActions = {
  raidenShutdown,
  raidenConfigUpdate,
  ...ChannelsActions,
  ...TransportActions,
  ...MessagesActions,
  ...TransfersActions,
  ...ServicesActions,
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

/**
 * Codec which decodes/validates actions which can be confirmed on-chain
 *
 * Note that this isn't a complete ActionCreator, but it helps identify and narrow actions which
 * matches this schema. Also important is that this codec isn't `t.exact`, and therefore it wil
 * validate objects with additional properties (like meta and payload properties), as long as it
 * matches the required schema below.
 */
export const ConfirmableAction = t.readonly(
  t.type({
    type: t.string,
    payload: t.readonly(
      t.type({
        txHash: Hash,
        txBlock: t.number,
        confirmed: t.union([t.undefined, t.boolean]),
      }),
    ),
  }),
);
/** The type of a confirmable action object. */
export type ConfirmableAction = t.TypeOf<typeof ConfirmableAction>;
