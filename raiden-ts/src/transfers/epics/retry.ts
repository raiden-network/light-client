import { EMPTY, MonoTypeOperatorFunction, Observable } from 'rxjs';
import { delay, filter, mergeMap, repeatWhen, takeUntil, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { RaidenConfig } from '../../config';
import { messageSend } from '../../messages/actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf, isResponseOf } from '../../utils/actions';
import { pluckDistinct } from '../../utils/rx';
import { transferExpire, transferSigned, transferUnlock } from '../actions';
import { dispatchAndWait$ } from './utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
function retryUntil<T>(notifier: Observable<any>, delayMs = 30e3): MonoTypeOperatorFunction<T> {
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
  state$: Observable<RaidenState>,
  predicate: (state: RaidenState) => boolean,
  delayMs = 30e3,
): Observable<messageSend.request> {
  return dispatchAndWait$(action$, send, isResponseOf(messageSend, send.meta)).pipe(
    retryUntil(state$.pipe(filter(predicate)), delayMs),
  );
}

/**
 * Core logic of {@link transferSignedRetryMessageEpic }.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of RaidenStates
 * @param action - The {@link transferSigned} action
 * @returns - Observable of {@link messageSend.request} actions
 */
const transferSignedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferSigned,
  { httpTimeout }: RaidenConfig,
): Observable<messageSend.request> => {
  const secrethash = action.meta.secrethash;
  const signed = action.payload.message;
  const send = messageSend.request(
    { message: signed },
    { address: signed.recipient, msgId: signed.message_identifier.toString() },
  );
  // emit request once immediatelly, then wait until success, then retry every 30s
  const processedOrNotPossibleToSend = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return (
      !!transfer.transferProcessed ||
      !!transfer.unlockProcessed ||
      !!transfer.lockExpiredProcessed ||
      !!transfer.channelClosed
    );
  };
  return retrySendUntil$(send, action$, state$, processedOrNotPossibleToSend, httpTimeout);
};

/**
 * Handles a transferSigned action and retry messageSend.request until transfer is gone (completed
 * with success or error) OR Processed message for LockedTransfer received.
 * transferSigned for pending LockedTransfer's may be re-emitted on startup for pending transfer,
 * to start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @returns Observable of messageSend.request actions
 */
export const transferSignedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferSigned)),
    withLatestFrom(config$),
    mergeMap(([action, config]) =>
      transferSignedRetryMessage$(action$, latest$.pipe(pluckDistinct('state')), action, config),
    ),
  );

/**
 * Core logic of {@link transferUnlockedRetryMessageEpic}
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of the latest RaidenStates
 * @param action - the transferUnlock.success action
 * @param state - Contains the current state of the app
 * @returns Observable of {@link messageSend.request} actions
 */
const transferUnlockedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferUnlock.success,
  state: RaidenState,
  { httpTimeout }: RaidenConfig,
): Observable<messageSend.request> => {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
  const unlock = action.payload.message;
  const transfer = state.sent[secrethash].transfer[1];
  const send = messageSend.request(
    { message: unlock },
    { address: transfer.recipient, msgId: unlock.message_identifier.toString() },
  );

  // emit request once immediatelly, then wait until respective success, then repeats until confirmed
  const unlockProcessedOrChannelClosed = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return !!transfer.unlockProcessed || !!transfer.channelClosed;
  };

  return retrySendUntil$(send, action$, state$, unlockProcessedOrChannelClosed, httpTimeout);
};

/**
 * Handles a transferUnlock.success action and retry messageSend until confirmed.
 * transferUnlock.success for pending Unlock's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @returns Observable of messageSend.request actions
 */
export const transferUnlockedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferUnlock.success)),
    withLatestFrom(latest$.pipe(pluckDistinct('state')), config$),
    mergeMap(([action, state, config]) =>
      transferUnlockedRetryMessage$(
        action$,
        latest$.pipe(pluckDistinct('state')),
        action,
        state,
        config,
      ),
    ),
  );

/**
 * Core logic of {@link transferExpiredRetryMessageEpic}.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of RaidenStates
 * @param action - transferExpire.success action
 * @param state - The current state of the app
 * @returns Observable of {@link messageSend.request} actions
 */
const expiredRetryMessages$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferExpire.success,
  state: RaidenState,
  { httpTimeout }: RaidenConfig,
): Observable<messageSend.request> => {
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
  const lockExpiredProcessedOrChannelClosed = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return !!transfer.lockExpiredProcessed || !!transfer.channelClosed;
  };
  // emit request once immediatelly, then wait until respective success, then retries until confirmed
  return retrySendUntil$(send, action$, state$, lockExpiredProcessedOrChannelClosed, httpTimeout);
};

/**
 * Handles a transferExpire.success action and retry messageSend.request until transfer is gone (completed
 * with success or error).
 * transferExpire.success for pending LockExpired's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param latest$ - RaidenEpicDeps latest
 * @returns Observable of messageSend.request actions
 */
export const transferExpiredRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferExpire.success)),
    withLatestFrom(latest$.pipe(pluckDistinct('state')), config$),
    mergeMap(([action, state, config]) =>
      expiredRetryMessages$(action$, latest$.pipe(pluckDistinct('state')), action, state, config),
    ),
  );
