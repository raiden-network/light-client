import { Observable, from, of } from 'rxjs';
import { catchError, filter, mergeMap, takeWhile, takeUntil } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { negate } from 'lodash';

import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../state';
import { raidenShutdown } from '../actions';

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
  matrixMessageReceivedEpic,
  matrixMessageReceivedUpdateRoomEpic,
} from './matrix';

export const raidenEpics = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> => {
  const shutdownNotification = action$.pipe(filter(isActionOf(raidenShutdown))),
    limitedAction$ = action$.pipe(
      takeWhile<RaidenAction>(negate(isActionOf(raidenShutdown)), true),
    ),
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));
  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
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
    matrixMessageReceivedEpic,
    matrixMessageReceivedUpdateRoomEpic,
  ]).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown({ reason: err }))),
    takeUntil(shutdownNotification),
  );
};
