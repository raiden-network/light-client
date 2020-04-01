import { from, Observable } from 'rxjs';
import { filter, first, mergeMap, withLatestFrom } from 'rxjs/operators';

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
        const meta = { secrethash, direction: Direction.SENT };
        // on init, request monitor presence of any pending transfer target
        yield matrixPresence.request(undefined, { address: sent.transfer[1].target });
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed)
          yield transferSigned({ message: sent.transfer[1], fee: sent.fee }, meta);
        // already unlocked, but Processed not received yet for Unlock
        if (sent.unlock) yield transferUnlock.success({ message: sent.unlock[1] }, meta);
        // lock expired, but Processed not received yet for LockExpired
        if (sent.lockExpired) yield transferExpire.success({ message: sent.lockExpired[1] }, meta);
      }
    }),
  );

/**
 * Re-queue pending Received transfer's
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSigned|transferUnlock.success actions
 */
export const initQueuePendingReceivedEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
) =>
  state$.pipe(
    first(),
    mergeMap(state =>
      from(Object.entries(state.received) as Array<[Hash, typeof state.received[string]]>),
    ),
    filter(
      ([, received]) =>
        !received.unlock &&
        !received.lockExpired &&
        !received.secret?.[1]?.registerBlock &&
        !received.channelClosed,
    ),
    withLatestFrom(config$),
    mergeMap(function*([[secrethash, received], { caps }]) {
      // loop over all pending transfers
      const meta = { secrethash, direction: Direction.RECEIVED };
      // on init, request monitor presence of any pending transfer initiator
      yield transferSigned({ message: received.transfer[1], fee: received.fee }, meta);
      // already revealed to us, but user didn't sign SecretReveal yet
      if (received.secret && !received.secretReveal)
        yield transferSecret({ secret: received.secret[1].value }, meta);
      // already revealed to sender, but they didn't Unlock yet
      if (received.secretReveal)
        yield transferSecretReveal({ message: received.secretReveal[1] }, meta);
      // secret not yet known; request iff receiving is enabled
      // secretRequest should always be defined as we sign it when receiving transfer
      if (!caps?.[Capabilities.NO_RECEIVE] && !received.secret && received.secretRequest) {
        yield matrixPresence.request(undefined, { address: received.transfer[1].initiator });
        yield transferSecretRequest({ message: received.secretRequest[1] }, meta);
      }
    }),
  );
