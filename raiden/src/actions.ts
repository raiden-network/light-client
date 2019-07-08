/**
 * Aggregate types and exported properties from actions from all modules
 */
import { pick } from 'lodash';
import { ActionType, getType } from 'typesafe-actions';
import * as StoreActions from './store/actions';
import * as ChannelsActions from './channels/actions';
import * as TransportActions from './transport/actions';
import * as MessagesActions from './messages/actions';
import * as TransfersActions from './transfers/actions';

export const RaidenActions = {
  ...StoreActions,
  ...ChannelsActions,
  ...TransportActions,
  ...MessagesActions,
  ...TransfersActions,
};

/* Tagged union of all action types from the action creators */
export type RaidenAction = ActionType<typeof RaidenActions>;

/* Mapping { [type: string]: Action } of a subset of RaidenActions exposed as events */
export const RaidenEvents = pick(
  RaidenActions,
  [RaidenActions.raidenShutdown, RaidenActions.newBlock, RaidenActions.matrixPresenceUpdate].map(
    getType,
  ),
);
/* Tagged union of RaidenEvents actions */
export type RaidenEvent = ActionType<typeof RaidenEvents>;
