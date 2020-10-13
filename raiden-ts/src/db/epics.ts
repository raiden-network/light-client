import { Observable } from 'rxjs';
import { ignoreElements, first, finalize } from 'rxjs/operators';

import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';

/**
 * Shutdown database instance when raiden shuts down
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.db - Database instance
 * @returns observable to shutdown db instance on raidenShutdown
 */
export function dbShutdownEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { db }: RaidenEpicDeps,
): Observable<never> {
  return action$.pipe(
    ignoreElements(),
    finalize(async () => {
      await db.busy$.pipe(first((busy) => !busy)).toPromise();
      db.busy$.next(true);
      try {
        await db.close();
      } finally {
        db.busy$.next(false);
        db.busy$.complete();
      }
    }),
  );
}
