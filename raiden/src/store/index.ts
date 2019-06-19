import { pick } from 'lodash';
import { ActionType, getType } from 'typesafe-actions';
import * as RaidenActions from './actions';

export * from './state';
export { raidenReducer } from './reducers';
export { raidenEpics } from './epics';

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
