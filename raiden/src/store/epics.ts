import { Observable, EMPTY } from 'rxjs';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';

/**
 * This epic simply pipes all states to stateOutput$ subject injected as dependency
 * As the observable output is passed directly to a subject, the subject will mirror obervable's
 * behavior, including automatically completing or erroring the subscription according to the
 * observable.
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @param stateOutput$  Subject of RaidenStates
 * @returns  Empty observable
 */
export const stateOutputEpic = (
  {  }: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { stateOutput$ }: RaidenEpicDeps,
): Observable<RaidenAction> => (state$.subscribe(stateOutput$), EMPTY);

/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 * The same as state, but with actions
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @param actionOutput$  Subject of RaidenStates
 * @returns  Empty observable
 */
export const actionOutputEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenAction> => (action$.subscribe(actionOutput$), EMPTY);
