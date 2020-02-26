import { defer, from, Observable, of } from 'rxjs';
import { concatMap, filter, first, map, mergeMap, tap, withLatestFrom } from 'rxjs/operators';

import { RaidenAction } from '../../actions';
import { messageSend } from '../../messages/actions';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Processed,
  RefundTransfer,
  WithdrawExpired,
} from '../../messages/types';
import {
  getBalanceProofFromEnvelopeMessage,
  signMessage,
  isMessageReceivedOfType,
} from '../../messages/utils';
import { RaidenState } from '../../state';
import { matrixPresence } from '../../transport/actions';
import { RaidenEpicDeps } from '../../types';
import { LruCache } from '../../utils/lru';
import { Hash, Signed } from '../../utils/types';
import {
  transfer,
  transferExpire,
  transferExpireProcessed,
  transferProcessed,
  transferSigned,
  transferUnlock,
  transferUnlockProcessed,
} from '../actions';

/**
 * Re-queue pending transfer's BalanceProof/Envelope messages for retry on init
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export const initQueuePendingEnvelopeMessagesEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<
  matrixPresence.request | transferSigned | transferUnlock.success | transferExpire.success
> =>
  state$.pipe(
    first(),
    mergeMap(function*(state) {
      // loop over all pending transfers
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash;
        // transfer already completed or channelClosed
        if (
          sent.unlockProcessed ||
          sent.lockExpiredProcessed ||
          sent.secret?.[1]?.registerBlock ||
          sent.channelClosed
        )
          continue;
        // on init, request monitor presence of any pending transfer target
        yield matrixPresence.request(undefined, { address: sent.transfer[1].target });
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed)
          yield transferSigned({ message: sent.transfer[1], fee: sent.fee }, { secrethash });
        // already unlocked, but Processed not received yet for Unlock
        if (sent.unlock) yield transferUnlock.success({ message: sent.unlock[1] }, { secrethash });
        // lock expired, but Processed not received yet for LockExpired
        if (sent.lockExpired)
          yield transferExpire.success({ message: sent.lockExpired[1] }, { secrethash });
      }
    }),
  );

/**
 * Handles receiving a signed Processed for some sent LockedTransfer
 * This will persist the Processed reply in transfer state and stop message retry
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferProcessed actions
 */
export const transferProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferProcessed> =>
  action$.pipe(
    filter(isMessageReceivedOfType(Signed(Processed))),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      let secrethash: Hash | undefined = undefined;
      for (const [key, sent] of Object.entries(state.sent)) {
        if (
          sent.transfer[1].message_identifier.eq(message.message_identifier) &&
          sent.transfer[1].recipient === action.meta.address
        ) {
          secrethash = key as Hash;
          break;
        }
      }
      if (!secrethash) return;
      yield transferProcessed({ message }, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent Unlock
 * It sends the success action for transfer (which resolves any pending Promise), marking it as
 * completed successfuly by setting sent.unlockProcessed
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.success|transferUnlockProcessed actions
 */
export const transferUnlockProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transfer.success | transferUnlockProcessed> =>
  action$.pipe(
    filter(isMessageReceivedOfType(Signed(Processed))),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      let secrethash: Hash | undefined;
      for (const [key, sent] of Object.entries(state.sent)) {
        if (
          sent.unlock &&
          sent.unlock[1].message_identifier.eq(message.message_identifier) &&
          sent.transfer[1].recipient === action.meta.address
        ) {
          secrethash = key as Hash;
          break;
        }
      }
      if (!secrethash) return;
      yield transfer.success(
        {
          balanceProof: getBalanceProofFromEnvelopeMessage(state.sent[secrethash].unlock![1]),
        },
        { secrethash },
      );
      yield transferUnlockProcessed({ message }, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent LockExpired
 * It marks the end of the unhappy case, by setting sent.lockExpiredProcessed
 * transfer.failure was already sent at newBlock handling/transferExpire.request time
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
 */
export const transferExpireProcessedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferExpireProcessed> =>
  action$.pipe(
    filter(isMessageReceivedOfType(Signed(Processed))),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      let secrethash: Hash | undefined;
      for (const [key, sent] of Object.entries(state.sent)) {
        if (
          sent.lockExpired &&
          sent.lockExpired[1].message_identifier.eq(message.message_identifier) &&
          sent.transfer[1].recipient === action.meta.address
        ) {
          secrethash = key as Hash;
          break;
        }
      }
      if (!secrethash) return;
      yield transferExpireProcessed({ message }, { secrethash });
    }),
  );

/**
 * Sends Processed for unhandled nonce'd messages
 *
 * We don't yet support receiving nor mediating transfers (LockedTransfer, RefundTransfer), but
 * also don't want the partner to keep retrying any messages intended for us indefinitely.
 * That's why we decided to just answer them with Processed, to clear their queue. Of course, we
 * still don't validate, store state for these messages nor handle them in any way (e.g. requesting
 * secret from initiator), so any transfer is going to expire, and then we also reply Processed for
 * the respective LockExpired.
 * Additionally, we hook in sending Processed for other messages which contain nonces (and require
 * Processed reply to stop being retried) but are safe to be ignored, like WithdrawExpired.
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @param signer - RaidenEpicDeps members
 * @returns Observable of messageSend.request actions
 */
export const transferReceivedReplyProcessedEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const cache = new LruCache<string, Signed<Processed>>(32);
  return action$.pipe(
    filter(
      isMessageReceivedOfType([
        Signed(LockedTransfer),
        Signed(RefundTransfer),
        Signed(LockExpired),
        Signed(WithdrawExpired),
      ]),
    ),
    concatMap(action => {
      const message = action.payload.message;
      // defer causes the cache check to be performed at subscription time
      return defer(() => {
        const msgId = message.message_identifier;
        const key = msgId.toString();
        const cached = cache.get(key);
        if (cached)
          return of(
            messageSend.request({ message: cached }, { address: action.meta.address, msgId: key }),
          );

        const processed: Processed = {
          type: MessageType.PROCESSED,
          // eslint-disable-next-line @typescript-eslint/camelcase
          message_identifier: msgId,
        };
        return from(signMessage(signer, processed, { log })).pipe(
          tap(signed => cache.put(key, signed)),
          map(signed =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};
