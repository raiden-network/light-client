/* eslint-disable @typescript-eslint/camelcase */
import { combineLatest, EMPTY, from, merge, MonoTypeOperatorFunction, Observable, of } from 'rxjs';
import {
  catchError,
  concatMap,
  delay,
  exhaustMap,
  filter,
  first,
  ignoreElements,
  map,
  mergeMap,
  publishReplay,
  repeatWhen,
  take,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { ActionType, getType, isActionOf } from 'typesafe-actions';
import { bigNumberify } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { findKey, get } from 'lodash';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { Address, Hash, Signed, UInt } from '../utils/types';
import { LruCache } from '../utils/lru';
import { messageReceived, messageSend, messageSent } from '../messages/actions';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Metadata,
  Processed,
  RefundTransfer,
  SecretRequest,
  SecretReveal,
  Unlock,
  WithdrawConfirmation,
  WithdrawExpired,
  WithdrawRequest,
} from '../messages/types';
import { getBalanceProofFromEnvelopeMessage, signMessage } from '../messages/utils';
import { Channel, ChannelState } from '../channels/state';
import { Lock, SignedBalanceProof } from '../channels/types';
import { channelClose, channelClosed, newBlock } from '../channels/actions';
import { matrixRequestMonitorPresence } from '../transport/actions';
import {
  transfer,
  transferExpire,
  transferExpired,
  transferExpireFailed,
  transferExpireProcessed,
  transferFailed,
  transferProcessed,
  transferred,
  transferRefunded,
  transferSecret,
  transferSecretRequest,
  transferSecretReveal,
  transferSigned,
  transferUnlock,
  transferUnlocked,
  transferUnlockProcessed,
  withdrawReceiveRequest,
  withdrawSendConfirmation,
} from './actions';
import { getLocksroot, getSecrethash, makeMessageId } from './utils';
import { Signer } from 'ethers';

/**
 * Return the next nonce for a (possibly missing) balanceProof, or else BigNumber(1)
 *
 * @param balanceProof - Balance proof to increase nonce from
 * @returns Increased nonce, or One if no balance proof provided
 */
function nextNonce(balanceProof?: SignedBalanceProof): UInt<8> {
  if (balanceProof) return balanceProof.nonce.add(1) as UInt<8>;
  else return One as UInt<8>;
}

function dispatchAndWait<A extends RaidenAction>(
  action$: Observable<RaidenAction>,
  request: A,
  predicate: (action: RaidenAction) => boolean,
) {
  return merge(
    // output once
    of(request),
    // but wait until respective success/failure action is seen before completing
    action$.pipe(
      filter(predicate),
      take(1),
      // don't output success/failure action, just wait for first match to complete
      ignoreElements(),
    ),
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function retryUntil<T>(notifier: Observable<any>, delayMs = 30e3): MonoTypeOperatorFunction<T> {
  // Resubscribe/retry every 30s after messageSend succeeds with messageSent
  // Notice first (or any) messageSend can wait for a long time before succeeding, as it
  // waits for address's user in transport to be online and joined room before actually
  // sending the message. That's why repeatWhen emits/resubscribe only some time after
  // sendOnceAndWaitSent$ completes, instead of a plain 'interval'
  // TODO: configurable retry delay, possibly use an exponential backoff timeout strat
  return input$ =>
    input$.pipe(
      repeatWhen(completed$ => completed$.pipe(delay(delayMs))),
      takeUntil(notifier),
    );
}

function retrySendUntil(
  send: ActionType<typeof messageSend>,
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  predicate: (state: RaidenState) => boolean,
) {
  return dispatchAndWait(
    action$,
    send,
    a =>
      isActionOf(messageSent, a) &&
      a.payload.message === send.payload.message &&
      a.meta.address === send.meta.address,
  ).pipe(retryUntil(state$.pipe(filter(predicate))));
}

/**
 * Create an observable to compose and sign a LockedTransfer message/transferSigned action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param state$ - Observable of current state
 * @param action - transfer request action to be sent
 * @param network,address,signer - RaidenEpicDeps members
 * @returns Observable of transferSigned|transferSecret|transferFailed actions
 */
function makeAndSignTransfer(
  state$: Observable<RaidenState>,
  action: ActionType<typeof transfer>,
  { network, address, signer, config$ }: RaidenEpicDeps,
) {
  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { revealTimeout }]) => {
      if (action.meta.secrethash in state.sent) {
        // don't throw to avoid emitting transferFailed, to just wait for already pending transfer
        console.error('transfer already present', action.meta);
        return EMPTY;
      }

      // assume paths are valid and recipient is first hop of first route
      // compose metadata from it, and use first path fee
      const metadata: Metadata = {
          routes: action.payload.paths.map(({ path }) => ({ route: path })),
        },
        fee = action.payload.paths[0].fee,
        recipient = action.payload.paths[0].path[0];

      const channel: Channel | undefined = state.channels[action.payload.tokenNetwork][recipient];
      // check below shouldn't fail because of route validation in pathFindServiceEpic
      // used here mostly for type narrowing on channel union
      if (!channel || channel.state !== ChannelState.open) throw new Error('not open');

      const lock: Lock = {
          amount: action.payload.value.add(fee) as UInt<32>, // fee is added to the lock amount
          expiration: bigNumberify(state.blockNumber + revealTimeout * 2) as UInt<32>,
          secrethash: action.meta.secrethash,
        },
        locks: Lock[] = [...(channel.own.locks || []), lock],
        locksroot = getLocksroot(locks),
        token = findKey(state.tokens, tn => tn === action.payload.tokenNetwork)! as Address;

      console.log(
        'Signing transfer of value',
        action.payload.value.toString(),
        'of token',
        token,
        ', to',
        action.payload.target,
        ', through routes',
        action.payload.paths,
        ', paying',
        fee.toString(),
        'in fees.',
      );

      const message: LockedTransfer = {
        type: MessageType.LOCKED_TRANSFER,
        message_identifier: makeMessageId(),
        chain_id: bigNumberify(network.chainId) as UInt<32>,
        token_network_address: action.payload.tokenNetwork,
        channel_identifier: bigNumberify(channel.id) as UInt<32>,
        nonce: nextNonce(channel.own.balanceProof),
        transferred_amount: (channel.own.balanceProof
          ? channel.own.balanceProof.transferredAmount
          : Zero) as UInt<32>,
        locked_amount: (channel.own.balanceProof
          ? channel.own.balanceProof.lockedAmount
          : Zero
        ).add(lock.amount) as UInt<32>,
        locksroot,
        payment_identifier: action.payload.paymentId,
        token,
        recipient,
        lock,
        target: action.payload.target,
        initiator: address,
        metadata,
      };
      return from(signMessage(signer, message)).pipe(
        mergeMap(function*(signed) {
          // besides transferSigned, also yield transferSecret (for registering) if we know it
          if (action.payload.secret)
            yield transferSecret({ secret: action.payload.secret }, action.meta);
          yield transferSigned({ message: signed, fee }, action.meta);
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
 * @param state$ - Observable of current state
 * @param action - transferUnlock request action to be sent
 * @param signer - RaidenEpicDeps members
 * @returns Observable of transferUnlocked actions
 */
function makeAndSignUnlock(
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferUnlock>,
  { signer }: RaidenEpicDeps,
) {
  return state$.pipe(
    first(),
    mergeMap(state => {
      const secrethash = action.meta.secrethash;
      if (!(secrethash in state.sent)) throw new Error('unknown transfer');
      const transfer = state.sent[secrethash].transfer[1],
        channel: Channel | undefined = get(state.channels, [
          transfer.token_network_address,
          transfer.recipient,
        ]);
      // shouldn't happen, channel close clears transfers, but unlock may already have been queued
      if (!channel || channel.state !== ChannelState.open || !channel.own.balanceProof)
        throw new Error('channel gone, not open or no balanceProof');

      let signed$: Observable<Signed<Unlock>>;
      if (state.sent[secrethash].unlock) {
        // unlock already signed, use cached
        signed$ = of(state.sent[secrethash].unlock![1]);
      } else {
        // don't forget to check after signature too, may have expired by then
        if (transfer.lock.expiration.lte(state.blockNumber)) throw new Error('lock expired');

        const locks: Lock[] = (channel.own.locks || []).filter(l => l.secrethash !== secrethash),
          locksroot = getLocksroot(locks);

        const message: Unlock = {
          type: MessageType.UNLOCK,
          message_identifier: makeMessageId(),
          chain_id: transfer.chain_id,
          token_network_address: transfer.token_network_address,
          channel_identifier: transfer.channel_identifier,
          nonce: nextNonce(channel.own.balanceProof),
          transferred_amount: channel.own.balanceProof.transferredAmount.add(
            transfer.lock.amount,
          ) as UInt<32>,
          locked_amount: channel.own.balanceProof.lockedAmount.sub(transfer.lock.amount) as UInt<
            32
          >,
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
          if (state.sent[secrethash].channelClosed) throw new Error('channel closed!');
          yield transferUnlocked({ message: signed }, action.meta);
          // messageSend Unlock handled by transferUnlockedRetryMessageEpic
          // we don't check if transfer was refunded. If partner refunded the transfer but still
          // forwarded the payment, we still act honestly and unlock if they revealed
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
 * Create an observable to compose and sign a LockExpired message/transferExpired action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param state$ - Observable of current state
 * @param action - transfer request action to be sent
 * @param signer - RaidenEpicDeps members
 * @returns Observable of transferExpired|transferExpireFailed actions
 */
function makeAndSignLockExpired(
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferExpire>,
  { signer }: RaidenEpicDeps,
): Observable<ActionType<typeof transferExpired | typeof transferExpireFailed>> {
  return state$.pipe(
    first(),
    mergeMap(state => {
      const secrethash = action.meta.secrethash;
      if (!(secrethash in state.sent)) throw new Error('unknown transfer');
      const transfer = state.sent[secrethash].transfer[1],
        channel: Channel | undefined = get(state.channels, [
          transfer.token_network_address,
          transfer.recipient,
        ]);
      if (!channel || channel.state !== ChannelState.open || !channel.own.balanceProof)
        throw new Error('channel gone, not open or no balanceProof');

      let signed$: Observable<Signed<LockExpired>>;
      if (state.sent[secrethash].lockExpired) {
        // lockExpired already signed, use cached
        signed$ = of(state.sent[secrethash].lockExpired![1]);
      } else {
        if (transfer.lock.expiration.gte(state.blockNumber))
          throw new Error('lock not yet expired');
        else if (state.sent[secrethash].unlock) throw new Error('transfer already unlocked');

        const locks: Lock[] = (channel.own.locks || []).filter(l => l.secrethash !== secrethash),
          locksroot = getLocksroot(locks);

        const message: LockExpired = {
          type: MessageType.LOCK_EXPIRED,
          message_identifier: makeMessageId(),
          chain_id: transfer.chain_id,
          token_network_address: transfer.token_network_address,
          channel_identifier: transfer.channel_identifier,
          nonce: nextNonce(channel.own.balanceProof),
          transferred_amount: channel.own.balanceProof.transferredAmount,
          locked_amount: channel.own.balanceProof.lockedAmount.sub(transfer.lock.amount) as UInt<
            32
          >,
          locksroot,
          recipient: transfer.recipient,
          secrethash,
        };
        signed$ = from(signMessage(signer, message));
      }

      return signed$.pipe(
        // messageSend LockExpired handled by transferExpiredRetryMessageEpic
        map(signed => transferExpired({ message: signed }, action.meta)),
      );
    }),
    catchError(err => of(transferExpireFailed(err, action.meta))),
  );
}

/**
 * Create an observable to compose and sign a [[WithdrawConfirmation]] message
 *
 * Validate we're inside expiration timeout, channel exists and is open, and that total_withdraw is
 * less than or equal withdrawable amount (while we don't receive, partner.deposit +
 * own.transferredAmount).
 * We need it inside [[transferGenerateAndSignEnvelopeMessageEpic]] concatMap/lock because we read
 * and change the 'nonce', even though WithdrawConfirmation doesn't carry a full balanceProof.
 * Also, instead of storing the messages in state and retrying, we just cache it and send cached
 * signed message on each received request.
 *
 * TODO: once we're able to receive transfers, instead of considering only own.transferredAmount,
 * we must also listen to ChannelWithdraw events, store it alongside pending withdraw requests and
 * take that into account before accepting a transfer and also total balance/capacity for accepting
 * a total_withdraw from a WithdrawRequest.
 *
 * @param state$ - Observable of current state
 * @param action - Withdraw request which caused this handling
 * @param signer - RaidenEpicDeps members
 * @param cache - A Map to store and reuse previously Signed<WithdrawConfirmation>
 * @returns Observable of transferExpired|transferExpireFailed actions
 */
function makeAndSignWithdrawConfirmation(
  state$: Observable<RaidenState>,
  action: ActionType<typeof withdrawReceiveRequest>,
  { signer }: RaidenEpicDeps,
  cache: LruCache<string, Signed<WithdrawConfirmation>>,
): Observable<ActionType<typeof withdrawSendConfirmation>> {
  return state$.pipe(
    first(),
    mergeMap(state => {
      const request = action.payload.message;

      const channel: Channel | undefined = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      // check channel is in valid state and requested total_withdraw is valid
      // withdrawable amount is: total_withdraw <= partner.deposit + own.transferredAmount
      if (
        !channel ||
        channel.state !== ChannelState.open ||
        !request.channel_identifier.eq(channel.id)
      )
        throw new Error('channel gone or not open');
      else if (request.expiration.lte(state.blockNumber))
        throw new Error('WithdrawRequest expired');
      else if (
        request.total_withdraw.gt(
          channel.partner.deposit.add(
            channel.own.balanceProof ? channel.own.balanceProof.transferredAmount : Zero,
          ),
        )
      )
        throw new Error(
          'invalid total_withdraw, greater than partner.deposit + own.transferredAmount',
        );

      let signed$: Observable<Signed<WithdrawConfirmation>>;
      const key = request.message_identifier.toString();
      const cached = cache.get(key);
      // ensure all parameters are equal the cached one before returning it, or else sign again
      if (
        cached &&
        cached.chain_id.eq(request.chain_id) &&
        cached.token_network_address === request.token_network_address &&
        cached.channel_identifier.eq(request.channel_identifier) &&
        cached.participant === request.participant &&
        cached.total_withdraw.eq(request.total_withdraw) &&
        cached.expiration.eq(request.expiration)
      ) {
        signed$ = of(cached);
      } else {
        const confirmation: WithdrawConfirmation = {
          type: MessageType.WITHDRAW_CONFIRMATION,
          message_identifier: request.message_identifier,
          chain_id: request.chain_id,
          token_network_address: request.token_network_address,
          channel_identifier: request.channel_identifier,
          participant: request.participant,
          total_withdraw: request.total_withdraw,
          nonce: nextNonce(channel.own.balanceProof),
          expiration: request.expiration,
        };
        signed$ = from(signMessage(signer, confirmation)).pipe(
          tap(signed => cache.put(key, signed)),
        );
      }

      return signed$.pipe(
        map(signed => withdrawSendConfirmation({ message: signed }, action.meta)),
      );
    }),
    catchError(err => {
      console.error('Error trying to handle WithdrawRequest, ignoring:', err);
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
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @returns Observable of output actions for this epic
 */
export const transferGenerateAndSignEnvelopeMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<ActionType<
  | typeof transferSigned
  | typeof transferSecret
  | typeof transferUnlocked
  | typeof transferFailed
  | typeof transferExpired
  | typeof transferExpireFailed
  | typeof withdrawSendConfirmation
>> =>
  state$.pipe(
    publishReplay(1, undefined, state$ => {
      const withdrawCache = new LruCache<string, Signed<WithdrawConfirmation>>(32);
      return action$.pipe(
        filter(isActionOf([transfer, transferUnlock, transferExpire, withdrawReceiveRequest])),
        concatMap(action => {
          switch (action.type) {
            case getType(transfer): {
              return makeAndSignTransfer(state$, action, deps);
            }
            case getType(transferUnlock): {
              return makeAndSignUnlock(state$, action, deps);
            }
            case getType(transferExpire): {
              return makeAndSignLockExpired(state$, action, deps);
            }
            default: {
              return makeAndSignWithdrawConfirmation(state$, action, deps, withdrawCache);
            }
          }
        }),
      );
    }),
  );

const transferSignedRetryMessage = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferSigned>,
) => {
  const secrethash = action.meta.secrethash,
    signed = action.payload.message,
    send = messageSend({ message: signed }, { address: signed.recipient });
  // emit Send once immediatelly, then wait until respective messageSent, then completes
  return retrySendUntil(
    send,
    action$,
    state$,
    state =>
      !!state.sent[secrethash].transferProcessed ||
      !!state.sent[secrethash].unlockProcessed ||
      !!state.sent[secrethash].lockExpiredProcessed ||
      !!state.sent[secrethash].channelClosed,
  );
};

/**
 * Handles a transferSigned action and retry messageSend until transfer is gone (completed with
 * success or error) OR Processed message for LockedTransfer received.
 * transferSigned for pending LockedTransfer's may be re-emitted on startup for pending transfer,
 * to start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageSend actions
 */
export const transferSignedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof messageSend>> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
      action$.pipe(
        filter(isActionOf(transferSigned)),
        mergeMap(action => transferSignedRetryMessage(action$, state$, action)),
      ),
    ),
  );

const transferUnlockRetryMessage = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferUnlocked>,
  state: RaidenState,
) => {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
  const unlock = action.payload.message,
    transfer = state.sent[secrethash].transfer[1],
    send = messageSend({ message: unlock }, { address: transfer.recipient });
  // emit Send once immediatelly, then wait until respective messageSent, then completes
  return retrySendUntil(
    send,
    action$,
    state$,
    state => !!state.sent[secrethash].unlockProcessed || !!state.sent[secrethash].channelClosed,
  );
};

/**
 * Handles a transferUnlocked action and retry messageSend until transfer is gone (completed with
 * success or error).
 * transferUnlocked for pending Unlock's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferUnlocked actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageSend actions
 */
export const transferUnlockedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof messageSend>> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
      action$.pipe(
        filter(isActionOf(transferUnlocked)),
        withLatestFrom(state$),
        mergeMap(([action, state]) => transferUnlockRetryMessage(action$, state$, action, state)),
      ),
    ),
  );

const expiredRetryMessages = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: ActionType<typeof transferExpired>,
  state: RaidenState,
) => {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
  const lockExpired = action.payload.message,
    send = messageSend(
      { message: lockExpired },
      { address: state.sent[secrethash].transfer[1].recipient },
    );
  // emit Send once immediatelly, then wait until respective messageSent, then completes
  return retrySendUntil(
    send,
    action$,
    state$,
    state =>
      !!state.sent[secrethash].lockExpiredProcessed || !!state.sent[secrethash].channelClosed,
  );
};

/**
 * Handles a transferExpired action and retry messageSend until transfer is gone (completed with
 * success or error).
 * transferExpired for pending LockExpired's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferExpired actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageSend actions
 */
export const transferExpiredRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof messageSend>> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
      action$.pipe(
        filter(isActionOf(transferExpired)),
        withLatestFrom(state$),
        mergeMap(([action, state]) => expiredRetryMessages(action$, state$, action, state)),
      ),
    ),
  );

function autoExpire(state: RaidenState, blockNumber: number, action$: Observable<RaidenAction>) {
  const requests$: Observable<ActionType<typeof transferExpire | typeof transferFailed>>[] = [];

  for (const [key, sent] of Object.entries(state.sent)) {
    if (
      sent.unlock ||
      sent.lockExpired ||
      sent.channelClosed ||
      sent.transfer[1].lock.expiration.gte(blockNumber)
    )
      continue;
    const secrethash = key as Hash;
    // this observable acts like a Promise: emits request once, completes on success/failure
    const requestAndWait$ = dispatchAndWait(
      action$,
      transferExpire(undefined, { secrethash }),
      a =>
        isActionOf([transferExpired, transferExpireFailed], a) && a.meta.secrethash === secrethash,
    );
    requests$.push(requestAndWait$);
    // notify users that this transfer failed definitely
    requests$.push(
      of(
        transferFailed(
          new Error(`transfer expired at block=${sent.transfer[1].lock.expiration.toString()}`),
          { secrethash },
        ),
      ),
    );
  }

  // process all requests before completing and restart handling newBlocks (in exhaustMap)
  return merge(...requests$);
}

/**
 * Process newBlocks, emits transferExpire (request to compose&sign LockExpired for a transfer)
 * if pending transfer's lock expired and transfer didn't unlock (succeed) in time
 * Also, emits transferFailed, to notify users that a transfer has failed (although it'll only be
 * considered as completed with fail once the transferExpireProcessed arrives).
 *
 * @param action$ - Observable of newBlock|transferExpired|transferExpireFailed actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferExpire|transferFailed actions
 */
export const transferAutoExpireEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferExpire | typeof transferFailed>> =>
  action$.pipe(
    filter(isActionOf(newBlock)),
    withLatestFrom(state$),
    // exhaustMap ignores new blocks while previous request batch is still pending
    exhaustMap(
      ([
        {
          payload: { blockNumber },
        },
        state,
      ]) => {
        return autoExpire(state, blockNumber, action$);
      },
    ),
  );

/**
 * Re-queue pending transfer's BalanceProof/Envelope messages for retry on init
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSigned|transferUnlocked actions
 */
export const initQueuePendingEnvelopeMessagesEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<
  | typeof matrixRequestMonitorPresence
  | typeof transferSigned
  | typeof transferUnlocked
  | typeof transferExpired
>> =>
  state$.pipe(
    first(),
    mergeMap(function*(state) {
      // loop over all pending transfers
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash;
        // transfer already completed or channelClosed
        if (sent.unlockProcessed || sent.lockExpiredProcessed || sent.channelClosed) continue;
        // on init, request monitor presence of any pending transfer target
        yield matrixRequestMonitorPresence(undefined, { address: sent.transfer[1].target });
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed)
          yield transferSigned({ message: sent.transfer[1], fee: sent.fee }, { secrethash });
        // already unlocked, but Processed not received yet for Unlock
        if (sent.unlock) yield transferUnlocked({ message: sent.unlock[1] }, { secrethash });
        // lock expired, but Processed not received yet for LockExpired
        if (sent.lockExpired)
          yield transferExpired({ message: sent.lockExpired[1] }, { secrethash });
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
 * Handles receiving a signed SecretRequest from target for some sent LockedTransfer
 * Emits a transferSecretRequest action only if all conditions are met
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
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
      // proceed only if we know the secret and the transfer
      if (!(message.secrethash in state.secrets) || !(message.secrethash in state.sent)) return;

      const transfer = state.sent[message.secrethash].transfer[1],
        fee = state.sent[message.secrethash].fee,
        value = transfer.lock.amount.sub(fee) as UInt<32>;
      if (
        transfer.target !== action.meta.address || // reveal only to target
        !transfer.payment_identifier.eq(message.payment_identifier)
      ) {
        console.warn('Invalid SecretRequest for transfer', message, transfer);
      } else if (
        !message.expiration.lte(transfer.lock.expiration) ||
        !message.expiration.gt(state.blockNumber)
      ) {
        console.warn('SecretRequest for expired transfer', message, transfer);
      } else if (!message.amount.gte(value)) {
        console.warn('SecretRequest for amount too small!', message, transfer);
      } /* accept request */ else {
        if (!message.amount.eq(value))
          console.warn('Accepted SecretRequest for amount different than sent', message, transfer);
        yield transferSecretRequest({ message }, { secrethash: message.secrethash });
      }
      // we don't check if transfer was refunded. If partner refunded the transfer but still
      // forwarded the payment, they would be in risk of losing their money, not us
    }),
  );

const secretReveal = (
  state: RaidenState,
  action: ActionType<typeof transferSecretRequest>,
  signer: Signer,
) => {
  const target = state.sent[action.meta.secrethash].transfer[1].target;

  let reveal$: Observable<Signed<SecretReveal>>;
  if (state.sent[action.meta.secrethash].secretReveal)
    reveal$ = of(state.sent[action.meta.secrethash].secretReveal![1]);
  else {
    const message: SecretReveal = {
      type: MessageType.SECRET_REVEAL,
      message_identifier: makeMessageId(),
      secret: state.secrets[action.meta.secrethash].secret,
    };
    reveal$ = from(signMessage(signer, message));
  }

  return reveal$.pipe(
    mergeMap(function*(message) {
      yield transferSecretReveal({ message }, action.meta);
      yield messageSend({ message }, { address: target });
    }),
  );
};

/**
 * Handles a transferSecretRequest action to send the respective secret to target
 * It both emits transferSecretReveal (to persist sent SecretReveal in state and indicate that
 * the secret was revealed and thus the transfer should be assumed as succeeded) as well as
 * triggers sending the message once. New SecretRequests will cause a new transferSecretRequest,
 * which will re-send the cached SecretReveal.
 *
 * @param action$ - Observable of transferSecretRequest actions
 * @param state$ - Observable of RaidenStates
 * @param signer - RaidenEpicDeps signer
 * @returns Observable of transferSecretReveal|messageSend actions
 */
export const transferSecretRevealEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { signer }: RaidenEpicDeps,
): Observable<ActionType<typeof transferSecretReveal | typeof messageSend>> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
      action$.pipe(
        filter(isActionOf(transferSecretRequest)),
        concatMap(action =>
          state$.pipe(
            first(),
            mergeMap(state => secretReveal(state, action, signer)),
          ),
        ),
      ),
    ),
  );

/**
 * Handles receiving a valid SecretReveal from recipient (neighbor/partner)
 * This indicates that the partner knowws the secret, and we should Unlock to avoid going on-chain.
 * The transferUnlock action is a request for the unlocking to be generated and sent.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
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
      const secrethash = getSecrethash(message.secret);
      if (
        !(secrethash in state.sent) ||
        action.meta.address !== state.sent[secrethash].transfer[1].recipient ||
        // don't unlock if channel closed
        state.sent[secrethash].channelClosed ||
        // don't unlock again if already unlocked, retry handled by transferUnlockedRetryMessageEpic
        // in the future, we may avoid retry until Processed, and [re]send once per SecretReveal
        state.sent[secrethash].unlock
      )
        return;
      // transferSecret is noop if we already know the secret (e.g. we're the initiator)
      yield transferSecret({ secret: message.secret }, { secrethash });
      // request unlock to be composed, signed & sent to partner
      yield transferUnlock(undefined, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent Unlock
 * It sends the success action for transfer (which resolves any pending Promise), marking it as
 * completed successfuly by setting sent.unlockProcessed
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferred|transferUnlockProcessed actions
 */
export const transferUnlockProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferred | typeof transferUnlockProcessed>> =>
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
          sent.unlock[1].message_identifier.eq(message.message_identifier) &&
          sent.transfer[1].recipient === action.meta.address
        ) {
          secrethash = key as Hash;
          break;
        }
      }
      if (!secrethash) return;
      yield transferred(
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
 * transferFailed was already sent at newBlock handling/transferExpire time
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
 */
export const transferExpireProcessedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferExpireProcessed>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(Processed).is(message)) return;
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
 * Complete or fail any pending transfer for any closing or closed channels
 * Transfer is considered successful if secret was revealed (as it could be claimed on-chain),
 * else it's considered as failed as couldn't succeed inside expiration timeout
 *
 * @param action$ - Observable of channelClose|channelClosed actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferred|transferFailed actions
 */
export const transferChannelClosedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferred | typeof transferFailed>> =>
  action$.pipe(
    filter(isActionOf([channelClose, channelClosed])),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash,
          transfer = sent.transfer[1];
        if (
          transfer.token_network_address !== action.meta.tokenNetwork ||
          transfer.recipient !== action.meta.partner
        )
          continue;
        // as we can't know for sure if recipient/partner received the secret or unlock,
        //consider transfer failed iff neither the secret was revealed nor the unlock happened
        if (!sent.secretReveal && !sent.unlock)
          yield transferFailed(new Error(`Channel closed before revealing or unlocking`), {
            secrethash,
          });
        else if (state.sent[secrethash].unlock)
          yield transferred(
            {
              balanceProof: getBalanceProofFromEnvelopeMessage(state.sent[secrethash].unlock![1]),
            },
            { secrethash },
          );
        else yield transferred({}, { secrethash });
      }
    }),
  );

/**
 * Receiving RefundTransfer for pending transfer fails it
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferFailed|transferRefunded actions
 */
export const transferRefundedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof transferRefunded | typeof transferFailed>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(RefundTransfer).is(message)) return;
      const secrethash = message.lock.secrethash;
      if (!(secrethash in state.sent)) return;
      const [, transfer] = state.sent[secrethash].transfer;
      if (
        message.initiator !== transfer.recipient ||
        !message.payment_identifier.eq(transfer.payment_identifier) ||
        !message.lock.amount.eq(transfer.lock.amount) ||
        !message.lock.expiration.eq(transfer.lock.expiration) ||
        state.sent[secrethash].unlock || // already unlocked
        state.sent[secrethash].lockExpired || // already expired
        state.sent[secrethash].channelClosed || // channel closed
        message.lock.expiration.lte(state.blockNumber) // lock expired but transfer didn't yet
      )
        return;
      yield transferRefunded({ message }, { secrethash });
      yield transferFailed(new Error('transfer refunded'), { secrethash });
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
 * @returns Observable of messageSend actions
 */
export const transferReceivedReplyProcessedEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { signer }: RaidenEpicDeps,
): Observable<ActionType<typeof messageSend>> => {
  const cache = new LruCache<string, Signed<Processed>>(32);
  return action$.pipe(
    filter(isActionOf(messageReceived)),
    concatMap(action => {
      const message = action.payload.message;
      if (
        !message ||
        !(
          Signed(LockedTransfer).is(message) ||
          Signed(RefundTransfer).is(message) ||
          Signed(LockExpired).is(message) ||
          Signed(WithdrawExpired).is(message)
        )
      )
        return EMPTY;
      const msgId = message.message_identifier,
        key = msgId.toString();
      const cached = cache.get(key);
      if (cached) return of(messageSend({ message: cached }, action.meta));

      const processed: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: msgId,
      };
      return from(signMessage(signer, processed)).pipe(
        tap(signed => cache.put(key, signed)),
        map(signed => messageSend({ message: signed }, action.meta)),
      );
    }),
  );
};

/**
 * When receiving a [[WithdrawRequest]] message, create the respective [[withdrawReceiveRequest]]
 * action
 *
 * @param action$ - Observable of messageReceived actions
 * @returns Observable of withdrawReceiveRequest actions
 */
export const withdrawRequestReceivedEpic = (
  action$: Observable<RaidenAction>,
): Observable<ActionType<typeof withdrawReceiveRequest>> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    mergeMap(function*(action) {
      const message = action.payload.message;
      if (
        !message ||
        !Signed(WithdrawRequest).is(message) ||
        message.participant !== action.meta.address
      )
        return;
      yield withdrawReceiveRequest(
        { message },
        {
          tokenNetwork: message.token_network_address,
          partner: message.participant,
          totalWithdraw: message.total_withdraw,
          expiration: message.expiration.toNumber(),
        },
      );
    }),
  );

/**
 * sendMessage when a [[withdrawSendConfirmation]] action is fired
 *
 * @param action$ - Observable of withdrawSendConfirmation actions
 * @returns Observable of messageSend actions
 */
export const withdrawSendConfirmationEpic = (
  action$: Observable<RaidenAction>,
): Observable<ActionType<typeof messageSend>> =>
  action$.pipe(
    filter(isActionOf(withdrawSendConfirmation)),
    map(action =>
      messageSend({ message: action.payload.message }, { address: action.meta.partner }),
    ),
  );
