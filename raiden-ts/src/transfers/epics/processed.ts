import { defer, from, Observable, of } from 'rxjs';
import { concatMap, filter, map, mergeMap, tap, withLatestFrom } from 'rxjs/operators';
import findKey from 'lodash/findKey';

import { RaidenAction } from '../../actions';
import { messageSend } from '../../messages/actions';
import { MessageType, Processed, RefundTransfer, WithdrawExpired } from '../../messages/types';
import {
  getBalanceProofFromEnvelopeMessage,
  signMessage,
  isMessageReceivedOfType,
} from '../../messages/utils';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { LruCache } from '../../utils/lru';
import { Hash, Signed } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import {
  transfer,
  transferExpireProcessed,
  transferProcessed,
  transferUnlockProcessed,
} from '../actions';
import { Direction } from '../state';

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
    mergeMap(function* ([action, state]) {
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
      yield transferProcessed({ message }, { secrethash, direction: Direction.SENT });
    }),
  );

/**
 * Handles sending Processed for a received EnvelopeMessages
 *
 * @param action$ - Observable of transferProcessed actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageSend.request actions
 */
export const transferProcessedSendEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf([transferProcessed, transferUnlockProcessed, transferExpireProcessed])),
    // transfer direction is RECEIVED, not message direction (which is outbound)
    filter((action) => action.meta.direction === Direction.RECEIVED),
    withLatestFrom(state$),
    map(([action, { received }]) =>
      messageSend.request(
        { message: action.payload.message },
        {
          address: received[action.meta.secrethash].partner,
          msgId: action.payload.message.message_identifier.toString(),
        },
      ),
    ),
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
    mergeMap(function* ([action, state]) {
      const message = action.payload.message;
      const secrethash = findKey(
        state.sent,
        (sent) =>
          sent.unlock &&
          sent.unlock[1].message_identifier.eq(message.message_identifier) &&
          sent.partner === action.meta.address,
      ) as Hash | undefined;
      if (!secrethash) return;
      const meta = { secrethash, direction: Direction.SENT };
      yield transfer.success(
        {
          balanceProof: getBalanceProofFromEnvelopeMessage(state.sent[secrethash].unlock![1]),
        },
        meta,
      );
      yield transferUnlockProcessed({ message }, meta);
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
    mergeMap(function* ([action, state]) {
      const message = action.payload.message;
      const secrethash = findKey(
        state.sent,
        (sent) =>
          sent.lockExpired &&
          sent.lockExpired[1].message_identifier.eq(message.message_identifier) &&
          sent.partner === action.meta.address,
      ) as Hash | undefined;
      if (!secrethash) return;
      yield transferExpireProcessed({ message }, { secrethash, direction: Direction.SENT });
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
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @returns Observable of messageSend.request actions
 */
export const transferReceivedReplyProcessedEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const cache = new LruCache<string, Signed<Processed>>(32);
  return action$.pipe(
    filter(isMessageReceivedOfType([Signed(RefundTransfer), Signed(WithdrawExpired)])),
    concatMap((action) => {
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
          tap((signed) => cache.put(key, signed)),
          map((signed) =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};
