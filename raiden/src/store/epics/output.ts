import { Observable, EMPTY } from 'rxjs';

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
): Observable<RaidenActions> => (state$.subscribe(stateOutput$), EMPTY);

/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 */
export const actionOutputEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> => (action$.subscribe(actionOutput$), EMPTY);
