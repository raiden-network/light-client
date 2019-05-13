import { ofType } from 'redux-observable';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap, takeUntil } from 'rxjs/operators';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import { RaidenActionType, RaidenActions, RaidenShutdownAction, raidenShutdown } from '../actions';

import {
  initNewBlockEpic,
  initMonitorProviderEpic,
  initMonitorChannelsEpic,
  initMonitorRegistryEpic,
} from './init';
import { stateOutputEpic, actionOutputEpic } from './output';
import { newBlockEpic } from './block';
import { tokenMonitoredEpic, channelMonitoredEpic } from './monitor';
import {
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
} from './channel';

export const raidenEpics = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenActions> => {
  const shutdownNotification = action$.pipe(
    ofType<RaidenActions, RaidenShutdownAction>(RaidenActionType.SHUTDOWN),
  );
  // like combineEpics, but completes action$, state$ and output$ when shutdownNotification emits
  return from([
    initNewBlockEpic,
    initMonitorProviderEpic,
    initMonitorRegistryEpic,
    initMonitorChannelsEpic,
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
  ]).pipe(
    mergeMap(epic =>
      epic(
        action$.pipe(takeUntil(shutdownNotification)),
        state$.pipe(takeUntil(shutdownNotification)),
        deps,
      ),
    ),
    takeUntil(shutdownNotification),
    catchError(err => of(raidenShutdown(err))),
  );
};
