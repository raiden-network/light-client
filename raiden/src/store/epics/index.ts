import { ofType } from 'redux-observable';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap, takeWhile, takeUntil } from 'rxjs/operators';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import { RaidenActionType, RaidenActions, RaidenShutdownAction, raidenShutdown } from '../actions';

import {
  initNewBlockEpic,
  initMonitorProviderEpic,
  initMonitorChannelsEpic,
  initMonitorRegistryEpic,
  initMatrixEpic,
} from './init';
import { stateOutputEpic, actionOutputEpic } from './output';
import { newBlockEpic } from './block';
import {
  tokenMonitoredEpic,
  channelMonitoredEpic,
  channelMatrixMonitorPresenceEpic,
} from './monitor';
import {
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
} from './channel';
import {
  matrixStartEpic,
  matrixShutdownEpic,
  matrixMonitorPresenceEpic,
  matrixPresenceUpdateEpic,
  matrixCreateRoomEpic,
  matrixInviteEpic,
  matrixHandleInvitesEpic,
  matrixLeaveExcessRoomsEpic,
  matrixLeaveUnknownRoomsEpic,
  matrixCleanLeftRoomsEpic,
  matrixMessageSendEpic,
} from './matrix';

export const raidenEpics = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenActions> => {
  const shutdownNotification = action$.pipe(
      ofType<RaidenActions, RaidenShutdownAction>(RaidenActionType.SHUTDOWN),
    ),
    limitedAction$ = action$.pipe(takeWhile(a => a.type !== RaidenActionType.SHUTDOWN, true)),
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));
  // like combineEpics, but completes action$, state$ and output$ when shutdownNotification emits
  return from([
    initNewBlockEpic,
    initMonitorProviderEpic,
    initMonitorRegistryEpic,
    initMonitorChannelsEpic,
    initMatrixEpic,
    stateOutputEpic,
    actionOutputEpic,
    newBlockEpic,
    tokenMonitoredEpic,
    channelOpenEpic,
    channelOpenedEpic,
    channelMonitoredEpic,
    channelDepositEpic,
    channelCloseEpic,
    channelSettleEpic,
    channelMatrixMonitorPresenceEpic,
    matrixStartEpic,
    matrixShutdownEpic,
    matrixMonitorPresenceEpic,
    matrixPresenceUpdateEpic,
    matrixCreateRoomEpic,
    matrixInviteEpic,
    matrixHandleInvitesEpic,
    matrixLeaveExcessRoomsEpic,
    matrixLeaveUnknownRoomsEpic,
    matrixCleanLeftRoomsEpic,
    matrixMessageSendEpic,
  ]).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown(err))),
    takeUntil(shutdownNotification),
  );
};
