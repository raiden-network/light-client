/* eslint-disable @typescript-eslint/no-explicit-any */
import { merge, Observable, of, MonoTypeOperatorFunction } from 'rxjs';
import { filter, ignoreElements, take, repeatWhen, delay, takeUntil } from 'rxjs/operators';

import { messageSend } from '../../messages/actions';
import { isResponseOf } from '../../utils/actions';
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

/**
 * Operator to repeat-subscribe an input observable until a notifier emits
 *
 * @param notifier - Notifier observable
 * @param delayMs - Delay between retries
 * @returns Monotype operator
 */
export function repeatUntil<T>(
  notifier: Observable<any>,
  delayMs = 30e3,
): MonoTypeOperatorFunction<T> {
  // Resubscribe/retry every 30s after messageSend succeeds
  // Notice first (or any) messageSend.request can wait for a long time before succeeding, as it
  // waits for address's user in transport to be online and joined room before actually
  // sending the message. That's why repeatWhen emits/resubscribe only some time after
  // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
  return (input$) =>
    input$.pipe(
      repeatWhen((completed$) => completed$.pipe(delay(delayMs))),
      takeUntil(notifier),
    );
}

/**
 * Retry sending a message until some condition is met
 *
 * @param send - messageSend.request to be sent
 * @param action$ - RaidenActions observable
 * @param notifier - Stops retrying when this notifier emits
 * @param delayMs - Delay between retries
 * @returns Observable which retry messageSend.request until notifier emits
 */
export function retrySendUntil$(
  send: messageSend.request,
  action$: Observable<RaidenAction>,
  notifier: Observable<any>,
  delayMs = 30e3,
): Observable<messageSend.request> {
  return dispatchAndWait$(action$, send, isResponseOf(messageSend, send.meta)).pipe(
    repeatUntil(notifier, delayMs),
  );
}
