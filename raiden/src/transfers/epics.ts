/* eslint-disable @typescript-eslint/camelcase */
import { of, from, combineLatest, Observable, ReplaySubject, EMPTY } from 'rxjs';
import {
  multicast,
  catchError,
  concatMap,
  filter,
  first,
  mergeMap,
  withLatestFrom,
} from 'rxjs/operators';
import { ActionType, isActionOf } from 'typesafe-actions';
import { bigNumberify, keccak256, randomBytes } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { findKey } from 'lodash';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../store';
import { REVEAL_TIMEOUT } from '../constants';
import { Address, Hash, Signature, UInt } from '../utils/types';
import { splitCombined } from '../utils/rxjs';
import { Presences } from '../transport/types';
import { getPresences$ } from '../transport/utils';
import { messageReceived } from '../messages/actions';
import { LockedTransfer, Processed, MessageType } from '../messages/types';
import { packMessage, isSigned } from '../messages/utils';
import { ChannelState, Lock } from '../channels/state';
import {
  transfer,
  transferSigned,
  transferSecret,
  transferProcessed,
  transferFailed,
} from './actions';
import { getLocksroot } from './utils';

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
        throw new Error('Could not find an online partner for tokenNetwork with enough capacity');
      const channel = state.channels[action.payload.tokenNetwork][recipient];
      // check below never fail, because of for loop filter, just for type narrowing
      if (channel.state !== ChannelState.open) throw new Error('not open');

      let secret = action.payload.secret;
      if (secret && keccak256(secret) !== action.meta.secrethash) {
        throw new Error('secrethash does not match provided secret');
      }
      let paymentId = action.payload.paymentId;
      if (!paymentId) paymentId = bigNumberify(randomBytes(8)) as UInt<8>;

      const lock: Lock = {
          amount: action.payload.amount,
          expiration: bigNumberify(state.blockNumber + REVEAL_TIMEOUT * 2) as UInt<32>,
          secrethash: action.meta.secrethash,
        },
        locks: Lock[] = [...(channel.own.locks || []), lock],
        locksroot = getLocksroot(locks),
        fee = action.payload.fee || (Zero as UInt<32>),
        msgId = bigNumberify(Date.now()) as UInt<8>,
        token = findKey(state.tokens, action.payload.tokenNetwork)! as Address;

      const message: LockedTransfer = {
        type: MessageType.LOCKED_TRANSFER,
        message_identifier: msgId,
        chain_id: bigNumberify(network.chainId) as UInt<32>,
        token_network_address: action.payload.tokenNetwork,
        channel_identifier: bigNumberify(channel.id) as UInt<32>,
        nonce: (channel.own.balanceProof ? channel.own.balanceProof.nonce.add(1) : One) as UInt<8>,
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
      const dataToSign = packMessage(message);

      return from(signer.signMessage(dataToSign)).pipe(
        mergeMap(function*(signature) {
          // besides transferSigned, also yield transferSecret (for registering) if we know it
          if (secret) yield transferSecret({ secret }, { secrethash: action.meta.secrethash });
          yield transferSigned({ ...message, signature: signature as Signature }, action.meta);
        }),
      );
    }),
    catchError(err => of(transferFailed(err, action.meta))),
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
): Observable<ActionType<typeof transferSigned | typeof transferSecret | typeof transferFailed>> =>
  combineLatest(getPresences$(action$), state$).pipe(
    multicast(new ReplaySubject(1), presencesStateReplay$ => {
      const [presences$, state$] = splitCombined(presencesStateReplay$);
      return action$.pipe(
        filter(isActionOf(transfer)),
        concatMap(action =>
          // TODO: add any other BP-changing observable below
          isActionOf(transfer, action)
            ? makeAndSignTransfer(presences$, state$, action, deps)
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
  {  }: RaidenEpicDeps,
): Observable<ActionType<typeof transferProcessed>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      // transport only accepts Signed messages if they're signed by same sender's meta.address
      if (!message || !Processed.is(message) || !isSigned(message)) return;
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
      yield transferProcessed(message, { secrethash });
    }),
  );
