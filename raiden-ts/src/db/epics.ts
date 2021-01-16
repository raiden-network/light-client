import { Observable } from 'rxjs';
import { ignoreElements } from 'rxjs/operators';

import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { completeWith } from '../utils/rx';

/**
 * An epic to error globally in case db.busy$ errors (i.e. database errors)
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.db - Database instance
 * @returns observable to shutdown db instance on raidenShutdown
 */
export function dbErrorsEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { db }: RaidenEpicDeps,
): Observable<never> {
  return db.busy$.pipe(ignoreElements(), completeWith(action$));
}
