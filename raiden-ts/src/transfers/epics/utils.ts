/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Contract } from '@ethersproject/contracts';
import type { Observable } from 'rxjs';
import { defer, merge, of } from 'rxjs';
import { filter, ignoreElements, take } from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { Channel } from '../../channels/state';
import type {
  MessageType,
  WithdrawConfirmation,
  WithdrawExpired,
  WithdrawRequest,
} from '../../messages';
import { messageSend } from '../../messages/actions';
import { assert } from '../../utils';
import { isResponseOf } from '../../utils/actions';
import { contractHasMethod } from '../../utils/ethers';
import { completeWith, repeatUntil } from '../../utils/rx';
import type { UInt } from '../../utils/types';
import { decode, HexString } from '../../utils/types';
import type { withdraw } from '../actions';
import { Direction } from '../state';

/**
 * Exponential back-off infinite generator
 *
 * @param start - First yielded value
 * @param max - Ceiling of values, won't increase above this number
 * @param multiplier - Multiply yielded value by this factor on each iteration
 * @yields Numbers representing delays in exponential backoff strategy of growth
 */
export function* exponentialBackoff(start = 1e3, max = 60e3, multiplier = 1.4) {
  let delay = start;
  while (true) {
    yield delay;
    delay = Math.min(max, Math.ceil(delay * multiplier));
  }
}

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
 * @param delayMs - Delay between retries, or Iterator yielding delays
 * @returns Observable which retry messageSend.request until notifier emits
 */
export function retrySendUntil$(
  send: messageSend.request,
  action$: Observable<RaidenAction>,
  notifier: Observable<any>,
  delayMs: number | Iterator<number> = 30e3,
): Observable<messageSend.request> {
  let first = true;
  return defer(() => {
    if (first) {
      first = false;
    } else if (send.payload.userId) {
      // from 1st retry on, pop payload.userId, to force re-fetch presence/metadata
      const { userId: _, ...payload } = send.payload;
      send = { ...send, payload };
    }
    return dispatchAndWait$(action$, send, isResponseOf(messageSend, send.meta));
  }).pipe(repeatUntil(notifier, delayMs), completeWith(action$));
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
  M extends WithdrawRequest | WithdrawConfirmation | WithdrawExpired,
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

/**
 * @param req - WithdrawRequest message
 * @param channel - Channel in which it was received
 * @returns withdraw async action meta for respective request
 */
export function withdrawMetaFromRequest(
  req: WithdrawRequest,
  channel: Channel,
): withdraw.request['meta'] {
  return {
    tokenNetwork: channel.tokenNetwork,
    partner: channel.partner.address,
    direction: req.participant === channel.partner.address ? Direction.RECEIVED : Direction.SENT,
    expiration: req.expiration.toNumber(),
    totalWithdraw: req.total_withdraw,
  };
}

/**
 * Fetches contract's code and parse if it has given method (by name)
 *
 * @param contract - contract instance to check
 * @param method - method name
 * @returns Observable of true, emitting a single value if successful, or erroring
 */
export function checkContractHasMethod$<C extends Contract>(
  contract: C,
  method: keyof C['functions'] & string,
): Observable<true> {
  return defer(async () => {
    const sighash = contract.interface.getSighash(method);
    // decode shouldn't fail if building with ^0.39 contracts, but runtime may be running
    // with 0.37 contracts, and the only way to know is by checking contract's code (memoized)
    assert(
      await contractHasMethod(decode(HexString(4), sighash, 'signature hash not found'), contract),
      ['contract does not have method', { contract: contract.address, method }],
    );
    return true as const;
  });
}
