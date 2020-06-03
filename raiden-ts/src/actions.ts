/**
 * Aggregate types and exported properties from actions from all modules
 */
import * as t from 'io-ts';

import { ShutdownReason } from './constants';
import { PartialRaidenConfig } from './config';
import { ActionType, createAction, Action } from './utils/actions';
import { ErrorCodec } from './utils/error';

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
 * Set of [serializable] actions which are first emitted with
 * payload.confirmed=undefined, then, after confirmation blocks, either with confirmed=true if tx
 * is still present on blockchain, or confirmed=false if it got removed by a reorg.
 *
 * These actions must comply with the following type:
 * {
 *   payload: {
 *     txHash: Hash;
 *     txBlock: number;
 *     confirmed: undefined | boolean;
 *   };
 *   meta: any;
 * }
 */
export const ConfirmableActions = [
  ChannelsActions.channelOpen.success,
  ChannelsActions.channelDeposit.success,
  ChannelsActions.channelWithdrawn,
  ChannelsActions.channelClose.success,
  ChannelsActions.channelSettle.success,
  TransfersActions.transferSecretRegister.success,
];
/**
 * Union of codecs of actions above
 */
export const ConfirmableAction = t.union([
  ChannelsActions.channelOpen.success.codec,
  ChannelsActions.channelDeposit.success.codec,
  ChannelsActions.channelWithdrawn.codec,
  ChannelsActions.channelClose.success.codec,
  ChannelsActions.channelSettle.success.codec,
  TransfersActions.transferSecretRegister.success.codec,
]);
export type ConfirmableAction =
  | ChannelsActions.channelOpen.success
  | ChannelsActions.channelDeposit.success
  | ChannelsActions.channelWithdrawn
  | ChannelsActions.channelClose.success
  | ChannelsActions.channelSettle.success
  | TransfersActions.transferSecretRegister.success;
