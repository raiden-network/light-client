import { Observable } from 'rxjs';
import { ignoreElements, tap } from 'rxjs/operators';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import { RaidenActions } from '../actions';

/**
 * This epic simply pipes all states to stateOutput$ subject injected as dependency
 */
export const stateOutputEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { stateOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  state$.pipe(
    tap(
      stateOutput$.next.bind(stateOutput$),
      stateOutput$.error.bind(stateOutput$),
      stateOutput$.complete.bind(stateOutput$),
    ),
    ignoreElements(),
  );

/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 */
export const actionOutputEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  action$.pipe(
    tap(
      actionOutput$.next.bind(actionOutput$),
      actionOutput$.error.bind(actionOutput$),
      actionOutput$.complete.bind(actionOutput$),
    ),
    ignoreElements(),
  );
