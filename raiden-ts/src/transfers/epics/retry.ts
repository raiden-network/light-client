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
import {
  transferExpire,
  transferSigned,
  transferUnlock,
  transferSecretRequest,
  transferSecretReveal,
} from '../actions';
import { Direction } from '../state';
import { dispatchAndWait$ } from './utils';

function repeatUntil<T>(notifier: Observable<any>, delayMs = 30e3): MonoTypeOperatorFunction<T> {
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
): Observable<messageSend.request> => {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return config$.pipe(
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
          (sent) =>
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
};

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
): Observable<messageSend.request> => {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
      const unlock = action.payload.message;
      const locked = state.sent[secrethash].transfer[1];
      const send = messageSend.request(
        { message: unlock },
        { address: locked.recipient, msgId: unlock.message_identifier.toString() },
      );

      const notifier = state$.pipe(
        pluckDistinct('sent', secrethash),
        filter((sent) => !!(sent.unlockProcessed || sent.channelClosed)),
      );
      // emit request once immediatelly, then wait until respective success,
      // then repeats until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );
};

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
): Observable<messageSend.request> => {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
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
        filter((sent) => !!(sent.lockExpiredProcessed || sent.channelClosed)),
      );
      // emit request once immediatelly, then wait until respective success,
      // then retries until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );
};

const secretRequestRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  config$: Observable<RaidenConfig>,
  action: transferSecretRequest,
): Observable<messageSend.request> => {
  if (action.meta.direction !== Direction.RECEIVED) return EMPTY;
  return state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
      const request = action.payload.message;
      const send = messageSend.request(
        { message: request },
        {
          address: state.received[secrethash].transfer[1].initiator,
          msgId: request.message_identifier.toString(),
        },
      );
      const notifier = state$.pipe(
        pluckDistinct('received', secrethash),
        // stop retrying when we've signed secretReveal, lock expired or channel closed
        // we could stop as soon as we know received.secret, but we use it to retry SecretReveal
        // signature, if it failed for any reason
        filter(
          (received) =>
            !!(received.secretReveal || received.lockExpired || received.channelClosed),
        ),
      );
      // emit request once immediatelly, then wait until respective success,
      // then retries until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );
};

const secretRevealRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  config$: Observable<RaidenConfig>,
  action: transferSecretReveal,
): Observable<messageSend.request> => {
  if (action.meta.direction !== Direction.RECEIVED) return EMPTY;
  return state$.pipe(
    first(),
    withLatestFrom(config$),
    switchMap(([state, { httpTimeout }]) => {
      const secrethash = action.meta.secrethash;
      const reveal = action.payload.message;
      const send = messageSend.request(
        { message: reveal },
        {
          address: state.received[secrethash].partner,
          msgId: reveal.message_identifier.toString(),
        },
      );
      const notifier = state$.pipe(
        pluckDistinct('received', secrethash),
        // stop retrying when we were unlocked, secret registered or channel closed
        // we don't test for lockExpired, as we know the secret and must not accept LockExpired
        filter(
          (received) =>
            !!(received.unlock || received.secret?.[1]?.registerBlock || received.channelClosed),
        ),
      );
      // emit request once immediatelly, then wait until respective success,
      // then retries until confirmed
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );
};

/**
 * Retry sending balance proof messages until their respective Processed
 *
 * @param action$ - Observable of transferExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export const transferRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const state$ = latest$.pipe(pluckDistinct('state'));
  return action$.pipe(
    filter(
      isActionOf([
        transferSigned,
        transferUnlock.success,
        transferExpire.success,
        transferSecretRequest,
        transferSecretReveal,
      ]),
    ),
    mergeMap((action) =>
      transferSigned.is(action)
        ? signedRetryMessage$(action$, state$, config$, action)
        : transferUnlock.success.is(action)
        ? unlockedRetryMessage$(action$, state$, config$, action)
        : transferExpire.success.is(action)
        ? expiredRetryMessages$(action$, state$, config$, action)
        : transferSecretRequest.is(action)
        ? secretRequestRetryMessage$(action$, state$, config$, action)
        : secretRevealRetryMessage$(action$, state$, config$, action),
    ),
  );
};
