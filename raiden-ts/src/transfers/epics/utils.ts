import { merge, Observable, of } from 'rxjs';
import { filter, ignoreElements, take } from 'rxjs/operators';

import { RaidenAction } from '../../actions';

/**
 * Dispatches an actions and waits until a condition is satisfied.
 *
 * @param action$ - Observable of actions that will be monitored
 * @param request - The request/action that will be dispatched
 * @param predicate - The condition that will that was to be satisfied for the observable to
 * complete
 * @returns Observable of the request type.
 */
export function dispatchAndWait$<A extends RaidenAction>(
  action$: Observable<RaidenAction>,
  request: A,
  predicate: (action: RaidenAction) => boolean,
): Observable<A> {
  return merge(
    // wait until respective success/failure action is seen before completing
    action$.pipe(
      filter(predicate),
      take(1),
      // don't output success/failure action, just wait for first match to complete
      ignoreElements(),
    ),
    // output once
    of(request),
  );
}
