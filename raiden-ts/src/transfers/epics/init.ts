import { from, Observable, merge, of, EMPTY } from 'rxjs';
import { filter, first, mergeMap, pluck, take, mergeMapTo } from 'rxjs/operators';

import { Capabilities } from '../../constants';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { matrixPresence } from '../../transport/actions';
import { Hash } from '../../utils/types';
import {
  transferExpire,
  transferSigned,
  transferUnlock,
  transferSecretRequest,
  transferSecretReveal,
  transferSecret,
} from '../actions';
import { Direction } from '../state';

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
) =>
  state$.pipe(
    first(),
    mergeMap(function* (state) {
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
        const meta = { secrethash, direction: Direction.SENT };
        // on init, request monitor presence of any pending transfer target
        yield matrixPresence.request(undefined, { address: sent.transfer[1].target });
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed)
          yield transferSigned(
            { message: sent.transfer[1], fee: sent.fee, partner: sent.partner },
            meta,
          );
        // already unlocked, but Processed not received yet for Unlock
        if (sent.unlock)
          yield transferUnlock.success({ message: sent.unlock[1], partner: sent.partner }, meta);
        // lock expired, but Processed not received yet for LockExpired
        if (sent.lockExpired)
          yield transferExpire.success(
            { message: sent.lockExpired[1], partner: sent.partner },
            meta,
          );
      }
    }),
  );

/**
 * Re-queue pending Received transfer's
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export const initQueuePendingReceivedEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
) =>
  state$.pipe(
    first(),
    mergeMap((state) =>
      from(Object.entries(state.received) as Array<[Hash, typeof state.received[string]]>),
    ),
    filter(
      ([, received]) =>
        !received.unlock &&
        !received.lockExpired &&
        !received.secret?.[1]?.registerBlock &&
        !received.channelClosed,
    ),
    mergeMap(([secrethash, received]) => {
      // loop over all pending transfers
      const meta = { secrethash, direction: Direction.RECEIVED };
      return merge(
        // on init, request monitor presence of any pending transfer initiator
        of(
          transferSigned(
            { message: received.transfer[1], fee: received.fee, partner: received.partner },
            meta,
          ),
        ),
        // already revealed to us, but user didn't sign SecretReveal yet
        received.secret && !received.secretReveal
          ? of(transferSecret({ secret: received.secret[1].value }, meta))
          : EMPTY,
        // already revealed to sender, but they didn't Unlock yet
        received.secretReveal
          ? of(transferSecretReveal({ message: received.secretReveal[1] }, meta))
          : EMPTY,
        // secret not yet known; request *when* receiving is enabled (may be later)
        // secretRequest should always be defined as we sign it when receiving transfer
        !received.secret && received.secretRequest
          ? config$.pipe(
              pluck('caps', Capabilities.NO_RECEIVE),
              filter((noReceive) => !noReceive),
              take(1),
              mergeMapTo(
                of(
                  matrixPresence.request(undefined, { address: received.transfer[1].initiator }),
                  transferSecretRequest({ message: received.secretRequest[1] }, meta),
                ),
              ),
            )
          : EMPTY,
      );
    }),
  );
