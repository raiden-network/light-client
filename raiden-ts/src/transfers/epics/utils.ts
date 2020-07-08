/* eslint-disable @typescript-eslint/no-explicit-any */
import { merge, Observable, of } from 'rxjs';
import { filter, ignoreElements, take } from 'rxjs/operators';

import { messageSend } from '../../messages/actions';
import { isResponseOf } from '../../utils/actions';
import { repeatUntil } from '../../utils/rx';
import { RaidenAction } from '../../actions';
import {
  MessageType,
  WithdrawRequest,
  WithdrawConfirmation,
  WithdrawExpired,
} from '../../messages';
import { UInt } from '../../utils/types';

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

/**
 * Creates a type-guard function which verifies 'msg' is of given type between withdraw messages
 * and that total_withdraw and expiration matches given 'data'.
 * May be used to find matching messages in [[ChannelEnd]]'s 'pendingWithdraws' array
 *
 * @param type - Literal type tag to filter
 * @param data - Optional data to match, either in 'meta' or another 'message' format
 * @returns Typeguard function to check for matching withdraw protocol messages
 */
export function matchWithdraw<
  T extends
    | MessageType.WITHDRAW_REQUEST
    | MessageType.WITHDRAW_CONFIRMATION
    | MessageType.WITHDRAW_EXPIRED,
  M extends WithdrawRequest | WithdrawConfirmation | WithdrawExpired
>(
  type: T,
  data?:
    | { total_withdraw: UInt<32>; expiration: UInt<32> }
    | { totalWithdraw: UInt<32>; expiration: number },
) {
  return (msg: M): msg is Extract<M, { type: T }> =>
    msg.type === type &&
    (!data ||
      (msg.expiration.eq(data.expiration) &&
        msg.total_withdraw.eq(
          'totalWithdraw' in data ? data.totalWithdraw : data.total_withdraw,
        )));
}
