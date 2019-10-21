/**
 * Aggregate types and exported properties from actions from all modules
 */
import { pick } from 'lodash';
import { ActionType, createStandardAction, getType, Action } from 'typesafe-actions';
import { ShutdownReason } from './constants';

import { RaidenConfig } from './config';
import * as ChannelsActions from './channels/actions';
import * as TransportActions from './transport/actions';
import * as MessagesActions from './messages/actions';
import * as TransfersActions from './transfers/actions';
import * as PathFindActions from './path/actions';

export const raidenShutdown = createStandardAction('raidenShutdown')<{
  reason: ShutdownReason | Error;
}>();

export const raidenConfigUpdate = createStandardAction('raidenConfigUpdate')<{
  config: Partial<RaidenConfig>;
}>();

export const RaidenActions = {
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
export const RaidenEvents = pick(
  RaidenActions,
  [
    RaidenActions.raidenShutdown,
    RaidenActions.newBlock,
    RaidenActions.matrixPresenceUpdate,
    RaidenActions.tokenMonitored,
  ].map(getType),
);
/* Tagged union of RaidenEvents actions */
export type RaidenEvent = ActionType<typeof RaidenEvents>;
