/* eslint-disable @typescript-eslint/no-explicit-any */
import { EMPTY, MonoTypeOperatorFunction, Observable } from 'rxjs';
import {
  delay,
  filter,
  mergeMap,
  repeatWhen,
  takeUntil,
  withLatestFrom,
  switchMap,
  first,
} from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { RaidenConfig } from '../../config';
import { messageSend } from '../../messages/actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf, isResponseOf } from '../../utils/actions';
import { pluckDistinct } from '../../utils/rx';
import { transferExpire, transferSigned, transferUnlock } from '../actions';
import { dispatchAndWait$ } from './utils';

function repeatUntil<T>(notifier: Observable<any>, delayMs = 30e3): MonoTypeOperatorFunction<T> {
  // Resubscribe/retry every 30s after messageSend succeeds
  // Notice first (or any) messageSend.request can wait for a long time before succeeding, as it
  // waits for address's user in transport to be online and joined room before actually
  // sending the message. That's why repeatWhen emits/resubscribe only some time after
  // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
  return input$ =>
    input$.pipe(
      repeatWhen(completed$ => completed$.pipe(delay(delayMs))),
      takeUntil(notifier),
    );
}

function retrySendUntil$(
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
 * Handles a transferSigned action and retry messageSend.request until transfer is gone (completed
 * with success or error) OR Processed message for LockedTransfer received.
 * transferSigned for pending LockedTransfer's may be re-emitted on startup for pending transfer,
 * to start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of latest RaidenStates
 * @param config$ - Observable of latest RaidenConfig
 * @param action - The {@link transferSigned} action
 * @returns - Observable of {@link messageSend.request} actions
 */
const signedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  config$: Observable<RaidenConfig>,
  action: transferSigned,
): Observable<messageSend.request> =>
  config$.pipe(
    first(),
    switchMap(({ httpTimeout }) => {
      const secrethash = action.meta.secrethash;
      const signed = action.payload.message;
      const send = messageSend.request(
        { message: signed },
        { address: signed.recipient, msgId: signed.message_identifier.toString() },
      );
      const notifier = state$.pipe(
        pluckDistinct('sent', secrethash),
        filter(
          sent =>
            !!(
              sent.transferProcessed ||
              sent.unlockProcessed ||
              sent.lockExpiredProcessed ||
              sent.channelClosed
            ),
        ),
      );
      // emit request once immediatelly, then wait until success, then retry every 30s
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );

/**
 * Handles a transferUnlock.success action and retry messageSend until confirmed.
 * transferUnlock.success for pending Unlock's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of the latest RaidenStates
 * @param config$ - Observable of latest RaidenConfig
 * @param action - the transferUnlock.success action
 * @returns Observable of {@link messageSend.request} actions
 */
const unlockedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  config$: Observable<RaidenConfig>,
  action: transferUnlock.success,
): Observable<messageSend.request> =>
  state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
      if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
      const unlock = action.payload.message;
      const transfer = state.sent[secrethash].transfer[1];
      const send = messageSend.request(
        { message: unlock },
        { address: transfer.recipient, msgId: unlock.message_identifier.toString() },
      );

      const notifier = state$.pipe(
        pluckDistinct('sent', secrethash),
        filter(sent => !!(sent.unlockProcessed || sent.channelClosed)),
      );
      // emit request once immediatelly, then wait until respective success,
      // then repeats until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );

/**
 * Handles a transferExpire.success action and retry messageSend.request until transfer is gone (completed
 * with success or error).
 * transferExpire.success for pending LockExpired's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of latest RaidenState
 * @param config$ - Observable of latest RaidenConfig
 * @param action - transferExpire.success action
 * @returns Observable of {@link messageSend.request} actions
 */
const expiredRetryMessages$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  config$: Observable<RaidenConfig>,
  action: transferExpire.success,
): Observable<messageSend.request> =>
  state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
      if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
      const lockExpired = action.payload.message;
      const send = messageSend.request(
        { message: lockExpired },
        {
          address: state.sent[secrethash].transfer[1].recipient,
          msgId: lockExpired.message_identifier.toString(),
        },
      );
      const notifier = state$.pipe(
        pluckDistinct('sent', secrethash),
        filter(sent => !!(sent.lockExpiredProcessed || sent.channelClosed)),
      );
      // emit request once immediatelly, then wait until respective success,
      // then retries until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );

/**
 * Retry sending balance proof messages until their respective Processed
 *
 * @param action$ - Observable of transferExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param latest$ - RaidenEpicDeps latest
 * @returns Observable of messageSend.request actions
 */
export const transferRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf([transferSigned, transferUnlock.success, transferExpire.success])),
    mergeMap(action =>
      transferSigned.is(action)
        ? signedRetryMessage$(action$, latest$.pipe(pluckDistinct('state')), config$, action)
        : transferUnlock.success.is(action)
        ? unlockedRetryMessage$(action$, latest$.pipe(pluckDistinct('state')), config$, action)
        : expiredRetryMessages$(action$, latest$.pipe(pluckDistinct('state')), config$, action),
    ),
  );
