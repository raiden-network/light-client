import { Observable, EMPTY } from 'rxjs';

import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../state';

/**
 * This epic simply pipes all states to stateOutput$ subject injected as dependency
 */
export const stateOutputEpic = (
  {  }: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { stateOutput$ }: RaidenEpicDeps,
): Observable<RaidenAction> => (state$.subscribe(stateOutput$), EMPTY);

/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 */
export const actionOutputEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenAction> => (action$.subscribe(actionOutput$), EMPTY);
