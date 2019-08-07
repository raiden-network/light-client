/* eslint-disable @typescript-eslint/camelcase */
import { of, from, combineLatest, merge, Observable, ReplaySubject, EMPTY } from 'rxjs';
import {
  multicast,
  catchError,
  concatMap,
  filter,
  first,
  map,
  mergeMap,
  withLatestFrom,
  tap,
  take,
  ignoreElements,
  repeatWhen,
  delay,
  takeUntil,
} from 'rxjs/operators';
import { ActionType, isActionOf } from 'typesafe-actions';
import { bigNumberify, keccak256 } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import { findKey } from 'lodash';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../store';
import { REVEAL_TIMEOUT } from '../constants';
import { Address, Hash, UInt } from '../utils/types';
import { splitCombined } from '../utils/rxjs';
import { LruCache } from '../utils/lru';
import { raidenInit } from '../store/actions';
import { Presences } from '../transport/types';
import { getPresences$ } from '../transport/utils';
import { messageReceived, messageSend, messageSent } from '../messages/actions';
import {
  MessageType,
  LockedTransfer,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
  Signed,
} from '../messages/types';
import { signMessage, getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { ChannelState } from '../channels/state';
import { Lock } from '../channels/types';
import {
  transfer,
  transferSigned,
  transferSecret,
  transferProcessed,
  transferFailed,
  transferSecretRequest,
  transferUnlock,
  transferUnlocked,
  transferUnlockProcessed,
  transferred,
} from './actions';
import { getLocksroot, makePaymentId, makeMessageId } from './utils';

/**
 * Create an observable to compose and sign a LockedTransfer message/transferSigned action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param presences$  Observable of address to last matrixPresenceUpdate mapping
 * @param state$  Observable of current state
 * @param action  transfer request action to be sent
 * @param network,address,signer  RaidenEpicDeps members
 * @returns  Observable of transferSigned|transferSecret actions
 */
function makeAndSignTransfer(
  presences$: Observable<Presences>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transfer>,
  { network, address, signer }: RaidenEpicDeps,
) {
  return presences$.pipe(
    withLatestFrom(state$),
    first(),
    mergeMap(([presences, state]) => {
      if (!(action.payload.target in presences)) throw new Error('target not monitored');
      if (!presences[action.payload.target].payload.available)
        throw new Error('target not available/online');

      let secret = action.payload.secret;
      if (secret && keccak256(secret) !== action.meta.secrethash) {
        throw new Error('secrethash does not match provided secret');
      }

      let signed$: Observable<Signed<LockedTransfer>>;
      if (action.meta.secrethash in state.sent) {
        // if already saw a transfer with secrethash, use cached instead of signing a new one
        signed$ = of(state.sent[action.meta.secrethash].transfer);
      } else {
        let recipient: Address | undefined = undefined;
        for (const [partner, channel] of Object.entries(
          state.channels[action.payload.tokenNetwork],
        )) {
          // capacity is own deposit - (own trasferred + locked) + (partner transferred)
          const capacity = channel.own.deposit
            .sub(
              channel.own.balanceProof
                ? channel.own.balanceProof.transferredAmount.add(
                    channel.own.balanceProof.lockedAmount,
                  )
                : Zero,
            )
            .add(
              // only relevant once we can receive from partner
              channel.partner.balanceProof ? channel.partner.balanceProof.transferredAmount : Zero,
            );
          if (channel.state !== ChannelState.open) {
            console.warn(
              `transfer: channel with "${partner}" in state "${channel.state}" instead of "${ChannelState.open}"`,
            );
          } else if (capacity.lt(action.payload.amount)) {
            console.warn(
              `transfer: channel with "${partner}" without enough capacity (${capacity.toString()})`,
            );
          } else if (!(partner in presences) || !presences[partner].payload.available) {
            console.warn(`transfer: partner "${partner}" not available in transport`);
          } else {
            recipient = partner as Address;
            break;
          }
        }
        if (!recipient)
          throw new Error(
            'Could not find an online partner for tokenNetwork with enough capacity',
          );

        const channel = state.channels[action.payload.tokenNetwork][recipient];
        // check below never fail, because of for loop filter, just for type narrowing
        if (channel.state !== ChannelState.open) throw new Error('not open');

        let paymentId = action.payload.paymentId;
        if (!paymentId) paymentId = makePaymentId();

        const lock: Lock = {
            type: 'Lock',
            amount: action.payload.amount,
            expiration: bigNumberify(state.blockNumber + REVEAL_TIMEOUT * 2) as UInt<32>,
            secrethash: action.meta.secrethash,
          },
          locks: Lock[] = [...(channel.own.locks || []), lock],
          locksroot = getLocksroot(locks),
          fee = action.payload.fee || (Zero as UInt<32>),
          msgId = makeMessageId(),
          token = findKey(state.tokens, tn => tn === action.payload.tokenNetwork)! as Address;

        const message: LockedTransfer = {
          type: MessageType.LOCKED_TRANSFER,
          message_identifier: msgId,
          chain_id: bigNumberify(network.chainId) as UInt<32>,
          token_network_address: action.payload.tokenNetwork,
          channel_identifier: bigNumberify(channel.id) as UInt<32>,
          nonce: (channel.own.balanceProof ? channel.own.balanceProof.nonce : Zero).add(1) as UInt<
            8
          >,
          transferred_amount: (channel.own.balanceProof
            ? channel.own.balanceProof.transferredAmount
            : Zero) as UInt<32>,
          locked_amount: (channel.own.balanceProof
            ? channel.own.balanceProof.lockedAmount
            : Zero
          ).add(action.payload.amount) as UInt<32>,
          locksroot,
          payment_identifier: paymentId,
          token,
          recipient,
          lock,
          target: action.payload.target,
          initiator: address,
          fee,
        };
        signed$ = from(signMessage(signer, message));
      }
      return signed$.pipe(
        mergeMap(function*(signed) {
          // besides transferSigned, also yield transferSecret (for registering) if we know it
          if (secret) yield transferSecret({ secret }, { secrethash: action.meta.secrethash });
          yield transferSigned({ message: signed }, { secrethash: action.meta.secrethash });
          // messageSend LockedTransfer handled by transferSignedRetryMessageEpic
        }),
      );
    }),
    catchError(err => of(transferFailed(err, action.meta))),
  );
}

/**
 * Create an observable to compose and sign a Unlock message/transferUnlocked action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param presences$  Observable of address to last matrixPresenceUpdate mapping
 * @param state$  Observable of current state
 * @param action  transfer request action to be sent
 * @param network,address,signer  RaidenEpicDeps members
 * @returns  Observable of transferUnlocked actions
 */
function makeAndSignUnlock(
  {  }: Observable<Presences>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferUnlock>,
  { signer }: RaidenEpicDeps,
) {
  return state$.pipe(
    first(),
    mergeMap(state => {
      const secrethash = action.meta.secrethash;
      if (!(secrethash in state.sent)) throw new Error('unknown transfer');
      const transfer = state.sent[secrethash].transfer;
      let signed$: Observable<Signed<Unlock>>;
      if (state.sent[secrethash].unlock) {
        // unlock already signed, use cached
        signed$ = of(state.sent[secrethash].unlock!);
      } else if (
        !(transfer.token_network_address in state.channels) ||
        !(transfer.recipient in state.channels[transfer.token_network_address])
      )
        throw new Error('channel gone');
      else {
        const channel = state.channels[transfer.token_network_address][transfer.recipient],
          balanceProof = channel.own.balanceProof;

        if (channel.state !== ChannelState.open) throw new Error('channel not open');
        if (!balanceProof) throw new Error('assert: balanceProof gone');
        // don't forget to check after signature too, may have expired by then
        if (transfer.lock.expiration.lte(state.blockNumber)) throw new Error('lock expired');

        const locks: Lock[] = (channel.own.locks || []).filter(l => l.secrethash !== secrethash),
          locksroot = getLocksroot(locks),
          msgId = makeMessageId();

        const message: Unlock = {
          type: MessageType.UNLOCK,
          message_identifier: msgId,
          chain_id: transfer.chain_id,
          token_network_address: transfer.token_network_address,
          channel_identifier: transfer.channel_identifier,
          nonce: balanceProof.nonce.add(1) as UInt<8>,
          transferred_amount: balanceProof.transferredAmount.add(transfer.lock.amount) as UInt<32>,
          locked_amount: balanceProof.lockedAmount.sub(transfer.lock.amount) as UInt<32>,
          locksroot,
          payment_identifier: transfer.payment_identifier,
          secret: state.secrets[action.meta.secrethash].secret,
        };
        signed$ = from(signMessage(signer, message));
      }

      return signed$.pipe(
        withLatestFrom(state$),
        mergeMap(function*([signed, state]) {
          if (transfer.lock.expiration.lte(state.blockNumber)) throw new Error('lock expired!');
          yield transferUnlocked({ message: signed }, action.meta);
          // messageSend Unlock handled by transferUnlockedRetryMessageEpic
        }),
      );
    }),
    catchError(err => {
      console.error('Error when trying to unlock after SecretReveal', err);
      return EMPTY;
    }),
  );
}

/**
 * Serialize creation and signing of BalanceProof-changing messages or actions
 * Actions which change any data in any channel balance proof must only ever be created reading
 * state inside the serialization flow provided by the concatMap, and also be composed and produced
 * inside it (inner, subscribed observable)
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @param deps  RaidenEpicDeps
 * @returns  Observable of output actions for this epic
 */
export const transferGenerateAndSignEnvelopeMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  ActionType<
    typeof transferSigned | typeof transferSecret | typeof transferUnlocked | typeof transferFailed
  >
> =>
  combineLatest(getPresences$(action$), state$).pipe(
    multicast(new ReplaySubject(1), presencesStateReplay$ => {
      const [presences$, state$] = splitCombined(presencesStateReplay$);
      return action$.pipe(
        filter(isActionOf([transfer, transferUnlock])),
        concatMap(action =>
          // TODO: add any other BP-changing observable below
          isActionOf(transfer, action)
            ? makeAndSignTransfer(presences$, state$, action, deps)
            : isActionOf(transferUnlock, action)
            ? makeAndSignUnlock(presences$, state$, action, deps)
            : EMPTY,
        ),
      );
    }),
  );

/**
 * Handles a transferSigned action and retry messageSend until transfer is gone (completed with
 * success or error) OR Processed message for LockedTransfer received.
 * transferSigned for pending LockedTransfer's may be re-emitted on startup for pending transfer,
 * to start retrying sending the message again until stop condition is met.
 *
 * @param action$  Observable of transferSigned actions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of messageSend actions
 */
export const transferSignedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof messageSend>> =>
  state$.pipe(
    multicast(new ReplaySubject(1), state$ =>
      action$.pipe(
        filter(isActionOf(transferSigned)),
        mergeMap(action => {
          const secrethash = action.meta.secrethash,
            signed = action.payload.message,
            send = messageSend({ message: signed }, { address: signed.recipient });
          // emit Send once immediatelly, then wait until respective messageSent, then completes
          const sendOnceAndWaitSent$ = merge(
            of(send),
            action$.pipe(
              filter(
                a =>
                  isActionOf(messageSent, a) &&
                  a.payload.message === send.payload.message &&
                  a.meta.address === send.meta.address,
              ),
              take(1),
              // don't output messageSent, just wait for it before completing
              ignoreElements(),
            ),
          );
          return sendOnceAndWaitSent$.pipe(
            // Resubscribe/retry every 30s after messageSend succeeds with messageSent
            // Notice first (or any) messageSend can wait for a long time before succeeding, as it
            // waits for address's user in transport to be online and joined room before actually
            // sending the message. That's why repeatWhen emits/resubscribe only some time after
            // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
            // TODO: configurable retry delay, possibly use an exponential backoff timeout strat
            repeatWhen(completed$ => completed$.pipe(delay(30e3))),
            // until transfer gone (not in state.sent anymore) OR transferProcessed received
            takeUntil(
              state$.pipe(
                filter(
                  state =>
                    !(secrethash in state.sent) || !!state.sent[secrethash].transferProcessed,
                ),
              ),
            ),
          );
        }),
      ),
    ),
  );

/**
 * Handles a transferUnlocked action and retry messageSend until transfer is gone (completed with
 * success or error).
 * transferUnlocked for pending Unlock's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$  Observable of transferUnlocked actions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of messageSend actions
 */
export const transferUnlockedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof messageSend>> =>
  state$.pipe(
    multicast(new ReplaySubject(1), state$ =>
      action$.pipe(
        filter(isActionOf(transferUnlocked)),
        withLatestFrom(state$),
        mergeMap(([action, state]) => {
          const secrethash = action.meta.secrethash;
          if (!(secrethash in state.sent) || !state.sent[secrethash].unlock) return EMPTY;
          const unlock = action.payload.message,
            transfer = state.sent[secrethash].transfer,
            send = messageSend({ message: unlock }, { address: transfer.recipient });
          // emit Send once immediatelly, then wait until respective messageSent, then completes
          const sendOnceAndWaitSent$ = merge(
            of(send),
            action$.pipe(
              filter(
                a =>
                  isActionOf(messageSent, a) &&
                  a.payload.message === send.payload.message &&
                  a.meta.address === send.meta.address,
              ),
              take(1),
              // don't output messageSent, just wait for it before completing
              ignoreElements(),
            ),
          );
          return sendOnceAndWaitSent$.pipe(
            // Resubscribe/retry every 30s after messageSend succeeds with messageSent
            // Notice first (or any) messageSend can wait for a long time before succeeding, as it
            // waits for address's user in transport to be online and joined room before actually
            // sending the message. That's why repeatWhen emits/resubscribe only some time after
            // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
            // TODO: configurable retry delay, possibly use an exponential backoff timeout strat
            repeatWhen(completed$ => completed$.pipe(delay(30e3))),
            // until transfer not in state.sent anymore, i.e. received transferUnlockProcessed
            takeUntil(state$.pipe(filter(state => !(secrethash in state.sent)))),
          );
        }),
      ),
    ),
  );

/**
 * Re-queue pending transfer's BalanceProof/Envelope messages for retry on raidenInit
 *
 * @param action$  Observable of raidenInit actions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of transferSigned|transferUnlocked actions
 */
export const initQueuePendingEnvelopeMessagesEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferSigned | typeof transferUnlocked>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(function*([, state]) {
      // loop over all pending transfers
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash,
          transfer = sent.transfer;
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed) yield transferSigned({ message: transfer }, { secrethash });
        // already unlocked, but Processed not received yet for Unlock
        // (or else transfer would have been cleared)
        if (sent.unlock) yield transferUnlocked({ message: sent.unlock }, { secrethash });
      }
    }),
  );

/**
 * Handles receiving a signed Processed for some sent LockedTransfer
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of output actions for this epic
 */
export const transferProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferProcessed>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(Processed).is(message)) return;
      let secrethash: Hash | undefined = undefined;
      for (const [key, sent] of Object.entries(state.sent)) {
        if (
          sent.transfer.message_identifier.eq(message.message_identifier) &&
          sent.transfer.recipient === action.meta.address
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
 * Handles receiving a signed SecretRequest for some sent LockedTransfer
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of output actions for this epic
 */
export const transferSecretRequestedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferSecretRequest>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(SecretRequest).is(message)) return;
      if (!(message.secrethash in state.secrets) || !(message.secrethash in state.sent)) return;
      const transfer = state.sent[message.secrethash].transfer;
      if (
        transfer.target !== action.meta.address ||
        !transfer.payment_identifier.eq(message.payment_identifier) ||
        !transfer.lock.amount.eq(message.amount) ||
        !transfer.lock.expiration.eq(message.expiration)
      )
        return;
      yield transferSecretRequest({ message }, { secrethash: message.secrethash });
    }),
  );

/**
 * Handles a transferSecretRequest action to send the respective secret
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @param signer  RaidenEpicDeps signer
 * @returns  Observable of output actions for this epic
 */
export const transferRevealSecretEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { signer }: RaidenEpicDeps,
): Observable<ActionType<typeof messageSend>> => {
  const cache = new LruCache<Hash, Signed<SecretReveal>>(32);
  return state$.pipe(
    multicast(new ReplaySubject(1), state$ =>
      action$.pipe(
        filter(isActionOf(transferSecretRequest)),
        concatMap(action =>
          state$.pipe(
            first(),
            mergeMap(state => {
              const target = state.sent[action.meta.secrethash].transfer.target;
              const cached = cache.get(action.meta.secrethash);
              if (cached) return of(messageSend({ message: cached }, { address: target }));
              const message: SecretReveal = {
                type: MessageType.SECRET_REVEAL,
                message_identifier: makeMessageId(),
                secret: state.secrets[action.meta.secrethash].secret,
              };
              return from(signMessage(signer, message)).pipe(
                tap(signed => cache.put(action.meta.secrethash, signed)),
                map(signed => messageSend({ message: signed }, { address: target })),
              );
            }),
          ),
        ),
      ),
    ),
  );
};

/**
 * Handles receiving a valid SecretReveal from recipient (neighbor/partner)
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of output actions for this epic
 */
export const transferSecretRevealedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferUnlock | typeof transferSecret>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(SecretReveal).is(message)) return;
      const secrethash = keccak256(message.secret) as Hash;
      if (
        !(secrethash in state.sent) ||
        action.meta.address !== state.sent[secrethash].transfer.recipient ||
        // don't unlock again if already unlocked, retry handled by transferUnlockedRetryMessageEpic
        // in the future, we may avoid retry until Processed, and [re]send once per SecretReveal
        !!state.sent[secrethash].unlock
      )
        return;
      // transferSecret is noop if we already know the secret (e.g. we're the initiator)
      yield transferSecret({ secret: message.secret }, { secrethash });
      yield transferUnlock({ message }, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent Unlock
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of output actions for this epic
 */
export const transferUnlockProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferUnlockProcessed>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(Processed).is(message)) return;
      let secrethash: Hash | undefined;
      for (const [key, sent] of Object.entries(state.sent)) {
        if (
          sent.unlock &&
          sent.unlock.message_identifier.eq(message.message_identifier) &&
          sent.transfer.recipient === action.meta.address
        ) {
          secrethash = key as Hash;
          break;
        }
      }
      if (!secrethash) return;
      yield transferUnlockProcessed({ message }, { secrethash });
    }),
  );

/**
 * transferUnlockProcessed means transfer succeeded
 *
 * @param action$  Observable of RaidenActions
 * @param state$  Observable of RaidenStates
 * @returns  Observable of output actions for this epic
 */
export const transferSuccessEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferred>> =>
  action$.pipe(
    filter(isActionOf(transferUnlockProcessed)),
    withLatestFrom(state$),
    map(([action, state]) =>
      transferred(
        {
          balanceProof: getBalanceProofFromEnvelopeMessage(
            state.sent[action.meta.secrethash].unlock!,
          ),
        },
        action.meta,
      ),
    ),
  );
