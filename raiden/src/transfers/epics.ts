/* eslint-disable @typescript-eslint/camelcase */
import { of, from, combineLatest, Observable, ReplaySubject, EMPTY } from 'rxjs';
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
} from 'rxjs/operators';
import { ActionType, isActionOf } from 'typesafe-actions';
import { bigNumberify, keccak256 } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { findKey } from 'lodash';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../store';
import { REVEAL_TIMEOUT } from '../constants';
import { Address, Hash, Secret, UInt } from '../utils/types';
import { splitCombined } from '../utils/rxjs';
import { LruCache } from '../utils/lru';
import { Presences } from '../transport/types';
import { getPresences$ } from '../transport/utils';
import { messageReceived, messageSend } from '../messages/actions';
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
  transferSecretReveal,
  transferUnlock,
  transferUnlockProcessed,
  transferred,
} from './actions';
import { getLocksroot, makePaymentId, makeMessageId } from './utils';

/**
 * Create an observable to compose and sign a LockedTransfer message/transferSigned action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
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

      let secret: Secret | undefined;
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

        secret = action.payload.secret;
        if (secret && keccak256(secret) !== action.meta.secrethash) {
          throw new Error('secrethash does not match provided secret');
        }
        let paymentId = action.payload.paymentId;
        if (!paymentId) paymentId = makePaymentId();

        const lock: Lock = {
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
          nonce: (channel.own.balanceProof ? channel.own.balanceProof.nonce.add(1) : One) as UInt<
            8
          >,
          transferred_amount: channel.own.balanceProof
            ? channel.own.balanceProof.transferredAmount
            : (Zero as UInt<32>),
          locked_amount: channel.own.balanceProof
            ? (channel.own.balanceProof.lockedAmount.add(action.payload.amount) as UInt<32>)
            : action.payload.amount,
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
          // TODO: retry messageSend
          yield messageSend({ message: signed }, { address: signed.recipient });
        }),
      );
    }),
    catchError(err => of(transferFailed(err, action.meta))),
  );
}

function makeAndSignUnlock(
  {  }: Observable<Presences>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferSecretReveal>,
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
          secret: action.payload.message.secret,
        };
        signed$ = from(signMessage(signer, message));
      }

      return signed$.pipe(
        withLatestFrom(state$),
        mergeMap(function*([signed, state]) {
          if (transfer.lock.expiration.lte(state.blockNumber)) throw new Error('lock expired!');
          yield transferUnlock({ message: signed }, action.meta);
          // TODO: retry messageSend
          yield messageSend({ message: signed }, { address: transfer.recipient });
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
 */
export const transferGenerateAndSignEnvelopeMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  ActionType<
    | typeof transferSigned
    | typeof transferSecret
    | typeof transferUnlock
    | typeof transferFailed
    | typeof messageSend
  >
> =>
  combineLatest(getPresences$(action$), state$).pipe(
    multicast(new ReplaySubject(1), presencesStateReplay$ => {
      const [presences$, state$] = splitCombined(presencesStateReplay$);
      return action$.pipe(
        filter(isActionOf([transfer, transferSecretReveal])),
        concatMap(action =>
          // TODO: add any other BP-changing observable below
          isActionOf(transfer, action)
            ? makeAndSignTransfer(presences$, state$, action, deps)
            : isActionOf(transferSecretReveal, action)
            ? makeAndSignUnlock(presences$, state$, action, deps)
            : EMPTY,
        ),
      );
    }),
  );

/**
 * Handles receiving a signed Processed for some sent LockedTransfer
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
      const sent = state.sent[message.secrethash];
      if (
        sent.transfer.target !== action.meta.address ||
        !sent.transfer.payment_identifier.eq(message.payment_identifier) ||
        !sent.transfer.lock.amount.eq(message.amount) ||
        !sent.transfer.lock.expiration.eq(message.expiration)
      )
        return;
      yield transferSecretRequest({ message }, { secrethash: message.secrethash });
    }),
  );

/**
 * Handles a transferSecretRequest action to send the respective secret
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
                message_identifier: bigNumberify(Date.now()) as UInt<8>,
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
 */
export const transferSecretRevealedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferSecretReveal>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(SecretReveal).is(message)) return;
      const secrethash = keccak256(message.secret) as Hash;
      // if below only relevant after we can receive, so we reveal after learning the secret
      // if (!(secrethash in state.secrets))
      //   yield transferSecret({ secret: message.secret }, { secrethash });
      if (
        !(secrethash in state.sent) ||
        action.meta.address !== state.sent[secrethash].transfer.recipient
      )
        return;
      yield transferSecretReveal({ message }, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent Unlock
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
