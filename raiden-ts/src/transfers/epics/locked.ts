import { Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';
import { combineLatest, EMPTY, from, Observable, of, merge, defer } from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  first,
  map,
  mergeMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import { messageReceived, messageSend } from '../../messages/actions';
import { RaidenAction } from '../../actions';
import { RaidenConfig } from '../../config';
import { assert } from '../../utils';
import { ChannelState, ChannelEnd } from '../../channels/state';
import { Lock } from '../../channels/types';
import { channelAmounts, channelKey, channelUniqueKey } from '../../channels/utils';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Metadata,
  Unlock,
  WithdrawConfirmation,
  WithdrawRequest,
  Processed,
  SecretRequest,
  WithdrawExpired,
} from '../../messages/types';
import {
  signMessage,
  isMessageReceivedOfType,
  messageReceivedTyped,
  getBalanceProofFromEnvelopeMessage,
} from '../../messages/utils';
import { matrixPresence } from '../../transport/actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { LruCache } from '../../utils/lru';
import { pluckDistinct } from '../../utils/rx';
import { Hash, Signed, UInt, Int, Address } from '../../utils/types';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Capabilities } from '../../constants';
import {
  transfer,
  transferExpire,
  transferSecret,
  transferSigned,
  transferUnlock,
  transferProcessed,
  transferSecretRequest,
  transferUnlockProcessed,
  transferExpireProcessed,
  withdraw,
  withdrawMessage,
  withdrawExpire,
  withdrawCompleted,
} from '../actions';
import { getLocksroot, makeMessageId, getSecrethash } from '../utils';
import { Direction } from '../state';
import { matchWithdraw } from './utils';

// calculate locks array for channel end without lock with given secrethash
function withoutLock(end: ChannelEnd, secrethash: Hash) {
  const locks = end.locks.filter((l) => l.secrethash !== secrethash);
  assert(locks.length === end.locks.length - 1, 'invalid locks size');
  return locks;
}

// calculate locked amount for a given locks array
function totalLocked(locks: readonly Lock[]) {
  return locks.reduce((acc, { amount }) => acc.add(amount), Zero) as UInt<32>;
}

// gets and asserts channel is open and optionally matches chain_id and channel_identifier
function getOpenChannel(
  state: RaidenState,
  key: { tokenNetwork: Address; partner: Address },
  matches?: { chain_id: UInt<32>; channel_identifier: UInt<32> },
) {
  const channel = state.channels[channelKey(key)];
  assert(channel?.state === ChannelState.open, 'channel not open');
  if (matches) {
    assert(matches.chain_id.eq(state.chainId), 'chainId mismatch');
    assert(matches.channel_identifier.eq(channel.id), 'channelId mismatch');
  }
  return channel;
}

/**
 * The core logic of {@link makeAndSignTransfer}.
 *
 * @param state - Contains The current state of the app
 * @param action - transfer request action to be sent.
 * @param config - Config object
 * @param config.revealTimeout - The reveal timeout for the transfer.
 * @param deps - {@link RaidenEpicDeps}
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current Network
 * @param deps.signer - Signer instance
 * @returns Observable of {@link transferSecret} or {@link transferSigned} actions
 */
function makeAndSignTransfer$(
  state: RaidenState,
  action: transfer.request,
  { revealTimeout }: RaidenConfig,
  { log, address, network, signer }: RaidenEpicDeps,
): Observable<transferSecret | transferSigned> {
  if (action.meta.secrethash in state.sent) {
    // don't throw to avoid emitting transfer.failure, to just wait for already pending transfer
    log.warn('transfer already present', action.meta);
    return EMPTY;
  }

  // assume paths are valid and recipient is first hop of first route
  // compose metadata from it, and use first path fee
  const metadata: Metadata = {
    routes: action.payload.paths.map(({ path }) => ({ route: path })),
  };
  const fee = action.payload.paths[0].fee;
  const partner = action.payload.paths[0].path[0];

  const tokenNetwork = action.payload.tokenNetwork;
  const channel = getOpenChannel(state, { tokenNetwork, partner });
  assert(
    !action.payload.expiration || action.payload.expiration >= state.blockNumber + revealTimeout,
    'expiration too soon',
  );

  const lock: Lock = {
    amount: action.payload.value.add(fee) as UInt<32>, // fee is added to the lock amount
    expiration: bigNumberify(
      action.payload.expiration || state.blockNumber + revealTimeout * 2,
    ) as UInt<32>,
    secrethash: action.meta.secrethash,
  };
  const locksroot = getLocksroot([...channel.own.locks, lock]);

  log.info(
    'Signing transfer of value',
    action.payload.value.toString(),
    'of token',
    channel.token,
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
    nonce: channel.own.nextNonce,
    transferred_amount: channel.own.balanceProof.transferredAmount,
    locked_amount: channel.own.balanceProof.lockedAmount.add(lock.amount) as UInt<32>,
    locksroot,
    payment_identifier: action.payload.paymentId,
    token: channel.token,
    recipient: partner,
    lock,
    target: action.payload.target,
    initiator: action.payload.initiator ?? address,
    metadata,
  };

  return from(signMessage(signer, message, { log })).pipe(
    mergeMap(function* (signed) {
      // messageSend LockedTransfer handled by transferRetryMessageEpic
      yield transferSigned({ message: signed, fee, partner }, action.meta);
      // besides transferSigned, also yield transferSecret (for registering) if we know it
      if (action.payload.secret)
        yield transferSecret({ secret: action.payload.secret }, action.meta);
    }),
  );
}

/**
 * Create an observable to compose and sign a LockedTransfer message/transferSigned action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param state$ - Observable of current state
 * @param action - transfer request action to be sent
 * @param deps - RaidenEpicDeps
 * @returns Observable of transferSigned|transferSecret|transfer.failure actions
 */
function sendTransferSigned(
  state$: Observable<RaidenState>,
  action: transfer.request,
  deps: RaidenEpicDeps,
): Observable<transferSecret | transferSigned | transfer.failure> {
  return combineLatest([state$, deps.config$]).pipe(
    first(),
    mergeMap(([state, config]) => makeAndSignTransfer$(state, action, config, deps)),
    catchError((err) => of(transfer.failure(err, action.meta))),
  );
}

/**
 * Contains the core logic of {@link makeAndSignUnlock}.
 *
 * @param state$ - Observable of the latest app state.
 * @param state - Contains The current state of the app
 * @param action - The transfer unlock action that will generate the transferUnlock.success action.
 * @param deps - Epics dependencies
 * @param deps.signer - The signer that will sign the message
 * @param deps.log - Logger instance
 * @returns Observable of {@link transferUnlock.success} action.
 */
function makeAndSignUnlock$(
  state$: Observable<RaidenState>,
  state: RaidenState,
  action: transferUnlock.request,
  { log, signer }: { signer: RaidenEpicDeps['signer']; log: RaidenEpicDeps['log'] },
): Observable<transferUnlock.success> {
  const secrethash = action.meta.secrethash;
  assert(secrethash in state.sent, 'unknown transfer');
  const locked = state.sent[secrethash].transfer[1];
  const tokenNetwork = locked.token_network_address;
  const partner = state.sent[secrethash].partner;
  const channel = getOpenChannel(state, { tokenNetwork, partner });

  let signed$: Observable<Signed<Unlock>>;
  if (state.sent[secrethash].unlock) {
    // unlock already signed, use cached
    signed$ = of(state.sent[secrethash].unlock![1]);
  } else {
    assert(state.sent[secrethash].secret, 'unknown secret');
    // don't forget to check after signature too, may have expired by then
    // allow unlocking past expiration if secret registered on-chain
    assert(
      state.sent[secrethash].secret![1].registerBlock > 0 ||
        locked.lock.expiration.gt(state.blockNumber),
      'lock expired',
    );

    const message: Unlock = {
      type: MessageType.UNLOCK,
      message_identifier: makeMessageId(),
      chain_id: locked.chain_id,
      token_network_address: locked.token_network_address,
      channel_identifier: locked.channel_identifier,
      nonce: channel.own.nextNonce,
      transferred_amount: channel.own.balanceProof.transferredAmount.add(
        locked.lock.amount,
      ) as UInt<32>,
      locked_amount: channel.own.balanceProof.lockedAmount.sub(locked.lock.amount) as UInt<32>,
      locksroot: getLocksroot(withoutLock(channel.own, secrethash)),
      payment_identifier: locked.payment_identifier,
      secret: state.sent[action.meta.secrethash].secret![1].value,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    withLatestFrom(state$),
    map(([signed, state]) => {
      assert(
        state.sent[secrethash].secret![1].registerBlock > 0 ||
          locked.lock.expiration.gt(state.blockNumber),
        'lock expired',
      );
      assert(!state.sent[secrethash].channelClosed, 'channel closed!');
      return transferUnlock.success({ message: signed, partner }, action.meta);
      // messageSend Unlock handled by transferRetryMessageEpic
      // we don't check if transfer was refunded. If partner refunded the transfer but still
      // forwarded the payment, we still act honestly and unlock if they revealed
    }),
  );
}

/**
 * Create an observable to compose and sign a Unlock message/transferUnlock.success action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param state$ - Observable of current state
 * @param action - transferUnlock.request request action to be sent
 * @param deps - RaidenEpicDeps members
 * @param deps.signer - Signer instance
 * @param deps.log - Logger instance
 * @returns Observable of transferUnlock.success actions
 */
function sendTransferUnlocked(
  state$: Observable<RaidenState>,
  action: transferUnlock.request,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferUnlock.success | transferUnlock.failure> {
  return state$.pipe(
    first(),
    mergeMap((state) => makeAndSignUnlock$(state$, state, action, { log, signer })),
    catchError((err) => {
      log.warn('Error trying to unlock after SecretReveal', err);
      return of(transferUnlock.failure(err, action.meta));
    }),
  );
}

/**
 * Contains the core logic of {@link makeAndSignLockExpired}.
 *
 * @param state - Contains The current state of the app
 * @param action - The transfer expire action.
 * @param signer - RaidenEpicDeps members
 * @param signer.signer - Signer instance
 * @param signer.log - Logger instance
 * @returns Observable of transferExpire.success actions
 */
function makeAndSignLockExpired$(
  state: RaidenState,
  action: transferExpire.request,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferExpire.success> {
  const secrethash = action.meta.secrethash;
  assert(secrethash in state.sent, 'unknown transfer');
  const locked = state.sent[secrethash].transfer[1];
  const tokenNetwork = locked.token_network_address;
  const partner = state.sent[secrethash].partner;
  const channel = getOpenChannel(state, { tokenNetwork, partner });

  let signed$: Observable<Signed<LockExpired>>;
  if (state.sent[secrethash].lockExpired) {
    // lockExpired already signed, use cached
    signed$ = of(state.sent[secrethash].lockExpired![1]);
  } else {
    assert(locked.lock.expiration.lt(state.blockNumber), 'lock not yet expired');
    assert(!state.sent[secrethash].unlock, 'transfer already unlocked');

    const locksroot = getLocksroot(withoutLock(channel.own, secrethash));

    const message: LockExpired = {
      type: MessageType.LOCK_EXPIRED,
      message_identifier: makeMessageId(),
      chain_id: locked.chain_id,
      token_network_address: locked.token_network_address,
      channel_identifier: locked.channel_identifier,
      nonce: channel.own.nextNonce,
      transferred_amount: channel.own.balanceProof.transferredAmount,
      locked_amount: channel.own.balanceProof.lockedAmount.sub(locked.lock.amount) as UInt<32>,
      locksroot,
      recipient: partner,
      secrethash,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    // messageSend LockExpired handled by transferRetryMessageEpic
    map((signed) => transferExpire.success({ message: signed, partner }, action.meta)),
  );
}

/**
 * Create an observable to compose and sign a LockExpired message/transferExpire.success action
 * As it's an async observable which depends on state and may return an action which changes it,
 * the returned observable must be subscribed in a serialized context that ensures non-concurrent
 * write access to the channel's balance proof (e.g. concatMap)
 *
 * @param state$ - Observable of current state
 * @param action - transfer request action to be sent
 * @param signer - RaidenEpicDeps members
 * @param signer.log - Logger instance
 * @param signer.signer - Signer instance
 * @returns Observable of transferExpire.success|transferExpire.failure actions
 */
function sendTransferExpired(
  state$: Observable<RaidenState>,
  action: transferExpire.request,
  { log, signer }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferExpire.success | transferExpire.failure> {
  return state$.pipe(
    first(),
    mergeMap((state) => makeAndSignLockExpired$(state, action, { signer, log })),
    catchError((err) => of(transferExpire.failure(err, action.meta))),
  );
}

function receiveTransferSigned(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<LockedTransfer>>,
  { address, log, signer, config$ }: RaidenEpicDeps,
): Observable<
  | transferSigned
  | transfer.failure
  | transferProcessed
  | transferSecretRequest
  | matrixPresence.request
> {
  const secrethash = action.payload.message.lock.secrethash;
  const meta = { secrethash, direction: Direction.RECEIVED };
  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { revealTimeout, caps }]) => {
      const transfer: Signed<LockedTransfer> = action.payload.message;
      if (secrethash in state.received) {
        log.warn('transfer already present', action.meta);
        const msgId = transfer.message_identifier;
        // if transfer matches the stored one, re-send Processed once
        if (
          state.received[secrethash].partner === action.meta.address &&
          state.received[secrethash].transfer[1].message_identifier.eq(msgId)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(
            transferProcessed({ message: state.received[secrethash].transferProcessed![1] }, meta),
          );
        } else return EMPTY;
      }

      // full balance proof validation
      const tokenNetwork = transfer.token_network_address;
      const partner = action.meta.address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, transfer);
      assert(transfer.nonce.eq(channel.partner.nextNonce), 'nonce mismatch');

      const locks = [...channel.partner.locks, transfer.lock];
      const locksroot = getLocksroot(locks);
      assert(transfer.locksroot === locksroot, 'locksroot mismatch');
      assert(
        transfer.transferred_amount.eq(channel.partner.balanceProof.transferredAmount),
        'transferredAmount mismatch',
      );
      assert(transfer.locked_amount.eq(totalLocked(locks)), 'lockedAmount mismatch');

      const { partnerCapacity } = channelAmounts(channel);
      assert(
        transfer.lock.amount.lte(partnerCapacity),
        'balanceProof total amount bigger than capacity',
      );
      // don't mind expiration, accept expired transfers to apply state change and stay in sync
      // with partner, so we can receive later LockExpired and transfers on top of it

      assert(transfer.recipient === address, "Received transfer isn't for us");

      log.info(
        'Receiving transfer of value',
        transfer.lock.amount.toString(),
        'of token',
        channel.token,
        ', from',
        transfer.initiator,
        ', through partner',
        partner,
      );

      let request$: Observable<Signed<SecretRequest> | undefined> = of(undefined);
      if (
        !caps?.[Capabilities.NO_RECEIVE] &&
        transfer.target === address &&
        // only request secret if transfer don't expire soon
        transfer.lock.expiration.sub(revealTimeout).gt(state.blockNumber)
      )
        request$ = defer(() => {
          const request: SecretRequest = {
            type: MessageType.SECRET_REQUEST,
            payment_identifier: transfer.payment_identifier,
            secrethash,
            amount: transfer.lock.amount,
            expiration: transfer.lock.expiration,
            message_identifier: makeMessageId(),
          };
          return signMessage(signer, request, { log });
        });

      const processed$ = defer(() => {
        const processed: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: transfer.message_identifier,
        };
        return signMessage(signer, processed, { log });
      });

      // if any of these signature prompts fail, none of these actions will be emitted
      return combineLatest([processed$, request$]).pipe(
        mergeMap(function* ([processed, request]) {
          yield transferSigned({ message: transfer, fee: Zero as Int<32>, partner }, meta);
          // sets TransferState.transferProcessed
          yield transferProcessed({ message: processed }, meta);
          if (request) {
            // request initiator's presence, to be able to request secret
            yield matrixPresence.request(undefined, { address: transfer.initiator });
            // request secret iff we're the target and receiving is enabled
            yield transferSecretRequest({ message: request }, meta);
          }
        }),
      );
    }),
    catchError((err) => of(transfer.failure(err, meta))),
  );
}

function receiveTransferUnlocked(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<Unlock>>,
  { log, signer }: RaidenEpicDeps,
) {
  const secrethash = getSecrethash(action.payload.message.secret);
  const meta = { secrethash, direction: Direction.RECEIVED };
  return state$.pipe(
    first(),
    mergeMap((state) => {
      if (!(secrethash in state.received)) return EMPTY;
      const received = state.received[secrethash];

      const unlock: Signed<Unlock> = action.payload.message;
      const partner = action.meta.address;
      assert(partner === received.partner, 'wrong partner');
      assert(!received.lockExpired, 'already expired');

      if (received.unlock) {
        log.warn('transfer already unlocked', action.meta);
        // if message matches the stored one, re-send Processed once
        if (
          received.unlockProcessed &&
          received.unlockProcessed[1].message_identifier.eq(unlock.message_identifier)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(transferUnlockProcessed({ message: received.unlockProcessed[1] }, meta));
        } else return EMPTY;
      }
      const locked = received.transfer[1];
      assert(unlock.token_network_address === locked.token_network_address, 'wrong tokenNetwork');

      // unlock validation
      const tokenNetwork = unlock.token_network_address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, unlock);
      assert(unlock.nonce.eq(channel.partner.nextNonce), 'nonce mismatch');

      const amount = locked.lock.amount;
      const locks = withoutLock(channel.partner, secrethash);
      assert(unlock.locksroot === getLocksroot(locks), 'locksroot mismatch');
      assert(
        unlock.transferred_amount.eq(channel.partner.balanceProof.transferredAmount.add(amount)),
        'transferredAmount mismatch',
      );
      assert(unlock.locked_amount.eq(totalLocked(locks)), 'lockedAmount mismatch');

      const processed: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: unlock.message_identifier,
      };
      // if any of these signature prompts fail, none of these actions will be emitted
      return from(signMessage(signer, processed, { log })).pipe(
        mergeMap(function* (processed) {
          // we should already know the secret, but if not, persist again
          yield transferSecret({ secret: unlock.secret }, meta);
          yield transferUnlock.success({ message: unlock, partner }, meta);
          // sets TransferState.transferProcessed
          yield transferUnlockProcessed({ message: processed }, meta);
          yield transfer.success(
            { balanceProof: getBalanceProofFromEnvelopeMessage(unlock) },
            meta,
          );
        }),
      );
    }),
    catchError((err) => {
      log.warn('Error trying to process received Unlock', err);
      return of(transferUnlock.failure(err, meta));
    }),
  );
}

function receiveTransferExpired(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<LockExpired>>,
  { log, signer, config$ }: RaidenEpicDeps,
) {
  const secrethash = action.payload.message.secrethash;
  const meta = { secrethash, direction: Direction.RECEIVED };
  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { confirmationBlocks }]) => {
      if (!(secrethash in state.received)) return EMPTY;
      const received = state.received[secrethash];

      const expired: Signed<LockExpired> = action.payload.message;
      const partner = action.meta.address;
      assert(partner === received.partner, 'wrong partner');
      assert(!received.unlock, 'transfer unlocked');

      if (received.lockExpired) {
        log.warn('transfer already expired', action.meta);
        // if message matches the stored one, re-send Processed once
        if (
          received.lockExpiredProcessed &&
          received.lockExpiredProcessed[1].message_identifier.eq(expired.message_identifier)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(transferExpireProcessed({ message: received.lockExpiredProcessed[1] }, meta));
        } else return EMPTY;
      }
      const locked = received.transfer[1];

      // lockExpired validation
      assert(
        locked.lock.expiration.add(confirmationBlocks).lte(state.blockNumber),
        'expiration block not confirmed yet',
      );
      assert(!received.secret?.[1]?.registerBlock, 'secret registered onchain');
      assert(expired.token_network_address === locked.token_network_address, 'wrong tokenNetwork');

      const tokenNetwork = expired.token_network_address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, expired);
      assert(expired.nonce.eq(channel.partner.nextNonce), 'nonce mismatch');

      const locks = withoutLock(channel.partner, secrethash);
      assert(expired.locksroot === getLocksroot(locks), 'locksroot mismatch');
      assert(expired.locked_amount.eq(totalLocked(locks)), 'lockedAmount mismatch');
      assert(
        expired.transferred_amount.eq(channel.partner.balanceProof.transferredAmount),
        'transferredAmount mismatch',
      );

      const processed: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: expired.message_identifier,
      };
      // if any of these signature prompts fail, none of these actions will be emitted
      return from(signMessage(signer, processed, { log })).pipe(
        mergeMap(function* (processed) {
          yield transferExpire.success({ message: expired, partner }, meta);
          // sets TransferState.transferProcessed
          yield transferExpireProcessed({ message: processed }, meta);
          yield transfer.failure(
            new RaidenError(ErrorCodes.XFER_EXPIRED, {
              block: locked.lock.expiration.toString(),
            }),
            meta,
          );
        }),
      );
    }),
    catchError((err) => {
      log.warn('Error trying to process received LockExpired', err);
      return of(transferExpire.failure(err, meta));
    }),
  );
}

/**
 * Handles a withdraw.request and send a WithdrawRequest to partner
 *
 * @param state$ - Observable of current state
 * @param action - Withdraw request which caused this handling
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.network - Current Network
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of withdrawMessage.request|withdraw.failure actions
 */
function sendWithdrawRequest(
  state$: Observable<RaidenState>,
  action: withdraw.request,
  { log, address, signer, network, config$, latest$ }: RaidenEpicDeps,
): Observable<withdrawMessage.request | withdraw.failure> {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return combineLatest([state$, config$, latest$]).pipe(
    first(),
    mergeMap(([state, { revealTimeout }, { presences }]) => {
      const channel = getOpenChannel(state, action.meta);
      if (
        channel.own.pendingWithdraws.some(matchWithdraw(MessageType.WITHDRAW_REQUEST, action.meta))
      )
        return EMPTY; // already requested, skip without failing
      assert(
        presences[action.meta.partner]?.payload?.available,
        ErrorCodes.CNL_WITHDRAW_PARTNER_OFFLINE,
      );
      assert(
        action.meta.expiration >= state.blockNumber + revealTimeout,
        ErrorCodes.CNL_WITHDRAW_EXPIRES_SOON,
      );
      assert(
        action.meta.totalWithdraw.gt(channel.own.withdraw),
        ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_LOW,
      );
      assert(
        action.meta.totalWithdraw.lte(channelAmounts(channel).ownTotalWithdrawable),
        ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_HIGH,
      );
      const request: WithdrawRequest = {
        type: MessageType.WITHDRAW_REQUEST,
        message_identifier: makeMessageId(),
        chain_id: bigNumberify(network.chainId) as UInt<32>,
        token_network_address: action.meta.tokenNetwork,
        channel_identifier: bigNumberify(channel.id) as UInt<32>,
        participant: address,
        total_withdraw: action.meta.totalWithdraw,
        nonce: channel.own.nextNonce,
        expiration: bigNumberify(action.meta.expiration) as UInt<32>,
      };
      return from(signMessage(signer, request, { log })).pipe(
        map((message) => withdrawMessage.request({ message }, action.meta)),
      );
    }),
    catchError((err) => of(withdraw.failure(err, action.meta))),
  );
}

/**
 * Validates a received WithdrawConfirmation message
 *
 * @param state$ - Observable of current state
 * @param action - Withdraw request which caused this handling
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @returns Observable of withdrawMessage.success actions
 */
function receiveWithdrawConfirmation(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<WithdrawConfirmation>>,
  { address }: RaidenEpicDeps,
): Observable<withdrawMessage.success | withdrawMessage.failure> {
  const confirmation = action.payload.message;
  const tokenNetwork = confirmation.token_network_address;
  const partner = action.meta.address;
  const withdrawMeta = {
    direction: Direction.SENT, // received confirmation is for sent withdraw request
    tokenNetwork,
    partner,
    totalWithdraw: confirmation.total_withdraw,
    expiration: confirmation.expiration.toNumber(),
  };
  return state$.pipe(
    first(),
    map((state) => {
      getOpenChannel(state, { tokenNetwork, partner }, confirmation);
      assert(confirmation.participant === address, 'participant mismatch');

      // don't validate request presence here, to always update nonce, but do on tx send
      return withdrawMessage.success({ message: confirmation }, withdrawMeta);
    }),
    catchError((err) => of(withdrawMessage.failure(err, withdrawMeta))),
  );
}

/**
 * Handles a withdrawExpire.request, sign and send a WithdrawExpired message to partner
 *
 * @param state$ - Observable of current state
 * @param action - WithdrawExpire request which caused this call
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @returns Observable of withdrawMessage.request|withdraw.failure actions
 */
function sendWithdrawExpired(
  state$: Observable<RaidenState>,
  action: withdrawExpire.request,
  { log, address, signer, config$ }: RaidenEpicDeps,
): Observable<withdrawExpire.success | withdrawExpire.failure | withdraw.failure> {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { confirmationBlocks }]) => {
      const channel = getOpenChannel(state, action.meta);

      assert(
        !channel.own.pendingWithdraws.some(
          matchWithdraw(MessageType.WITHDRAW_EXPIRED, action.meta),
        ),
        'already expired',
      );

      const req = channel.own.pendingWithdraws.find(
        matchWithdraw(MessageType.WITHDRAW_REQUEST, action.meta),
      );
      assert(req, 'no matching WithdrawRequest found, maybe already confirmed');
      assert(state.blockNumber >= action.meta.expiration + confirmationBlocks, 'not yet expired');

      const expired: WithdrawExpired = {
        type: MessageType.WITHDRAW_EXPIRED,
        message_identifier: makeMessageId(),
        chain_id: req.chain_id,
        token_network_address: req.token_network_address,
        channel_identifier: req.channel_identifier,
        participant: address,
        total_withdraw: action.meta.totalWithdraw,
        nonce: channel.own.nextNonce,
        expiration: req.expiration,
      };
      return from(signMessage(signer, expired, { log })).pipe(
        mergeMap(function* (message) {
          yield withdrawExpire.success({ message }, action.meta);
          yield withdraw.failure(new RaidenError(ErrorCodes.CNL_WITHDRAW_EXPIRED), action.meta);
        }),
      );
    }),
    catchError((err) => of(withdrawExpire.failure(err, action.meta))),
  );
}

/**
 * Validate a [[WithdrawRequest]], compose and send a [[WithdrawConfirmation]]
 *
 * Validate channel exists and is open, and that total_withdraw is less than or equal withdrawable
 * amount.  We need it inside [[transferGenerateAndSignEnvelopeMessageEpic]] concatMap/lock because
 * we read and change 'nextNonce', even though WithdrawConfirmation doesn't carry a full
 * balanceProof. If request's nonce is valid but it already expired (old replied message), we still
 * accept the state change, but don't compose/send the confirmation, and let it expire.
 * Instead of storing confirmation in state and retrying, we just cache it and send the cached
 * signed message on each retried request received.
 *
 * @param state$ - Observable of current state
 * @param action - Withdraw request which caused this handling
 * @param signer - RaidenEpicDeps members
 * @param signer.signer - Signer instance
 * @param signer.log - Logger instance
 * @returns Observable of transferExpire.success|transferExpire.failure actions
 */
function receiveWithdrawRequest(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<WithdrawRequest>>,
  { signer, log }: RaidenEpicDeps,
): Observable<
  withdrawMessage.request | withdrawMessage.success | withdrawMessage.failure | messageSend.request
> {
  const request = action.payload.message;
  const tokenNetwork = request.token_network_address;
  const partner = request.participant;
  const withdrawMeta = {
    direction: Direction.RECEIVED,
    tokenNetwork,
    partner,
    totalWithdraw: request.total_withdraw,
    expiration: request.expiration.toNumber(),
  };

  return state$.pipe(
    first(),
    mergeMap((state) => {
      assert(request.participant === action.meta.address, 'participant mismatch');
      const channel = getOpenChannel(state, { tokenNetwork, partner }, request);

      let confirmation$: Observable<Signed<WithdrawConfirmation>>;
      const persistedConfirmation = channel.partner.pendingWithdraws.find(
        matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, request),
      );
      if (persistedConfirmation) {
        confirmation$ = of(persistedConfirmation);
      } else {
        assert(request.nonce.eq(channel.partner.nextNonce), 'nonce mismatch');
        assert(
          request.total_withdraw.lte(channelAmounts(channel).partnerTotalWithdrawable),
          'invalid total_withdraw',
        );

        // don't mind expiration, and always reply with confirmation
        // expired confirmations are useless on-chain, but confirms message
        const confirmation: WithdrawConfirmation = {
          type: MessageType.WITHDRAW_CONFIRMATION,
          message_identifier: request.message_identifier,
          chain_id: request.chain_id,
          token_network_address: request.token_network_address,
          channel_identifier: request.channel_identifier,
          participant: request.participant,
          total_withdraw: request.total_withdraw,
          nonce: channel.own.nextNonce,
          expiration: request.expiration,
        };
        confirmation$ = from(signMessage(signer, confirmation, { log }));
      }

      return confirmation$.pipe(
        mergeMap(function* (message) {
          // first, emit 'WithdrawRequest', to increase partner's nonce in state
          yield withdrawMessage.request({ message: request }, withdrawMeta);
          // emit our composed 'WithdrawConfirmation' to increase our nonce in state
          yield withdrawMessage.success({ message }, withdrawMeta);
          // send once per received request; confirmation signature is cached above
          yield messageSend.request(
            { message },
            {
              address: partner,
              msgId: action.payload.message.message_identifier.toString(),
            },
          );
        }),
      );
    }),
    catchError((err) => of(withdrawMessage.failure(err, withdrawMeta))),
  );
}

/**
 * Validate a received [[WithdrawExpired]] message, emit withdrawExpire.success and send Processed
 *
 * On raiden-ts, we don't require this message to expire the previous WithdrawRequest, since
 * each peer can do it on its own as soon as expiration block gets confirmed. But we must handle
 * it in order to increase partner's `nextNonce` and stay in sync with their end state, and we need
 * to sign and send a [[Processed]] message to make them stop spamming it to us.
 *
 * @param state$ - Observable of current state
 * @param action - Withdraw request which caused this handling
 * @param signer - RaidenEpicDeps members
 * @param signer.signer - Signer instance
 * @param signer.log - Logger instance
 * @param signer.config$ - Config observable
 * @param cache - A Map to store and reuse previously Signed<WithdrawConfirmation>
 * @returns Observable of withdrawExpire.success|withdrawExpireProcessed|messageSend.request actions
 */
function receiveWithdrawExpired(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<WithdrawExpired>>,
  { signer, log, config$ }: RaidenEpicDeps,
  cache: LruCache<string, Signed<Processed>>,
): Observable<
  withdrawExpire.success | withdrawExpire.failure | withdrawCompleted | messageSend.request
> {
  const expired = action.payload.message;
  const tokenNetwork = expired.token_network_address;
  const partner = expired.participant;
  const withdrawMeta = {
    direction: Direction.RECEIVED,
    tokenNetwork,
    partner,
    totalWithdraw: expired.total_withdraw,
    expiration: expired.expiration.toNumber(),
  };

  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { confirmationBlocks }]) => {
      assert(partner === action.meta.address, 'participant mismatch');
      const channel = getOpenChannel(state, { tokenNetwork, partner }, expired);

      let processed$: Observable<Signed<Processed>>;
      const cacheKey = `${channelUniqueKey(channel)}+${expired.message_identifier.toString()}`;
      const cached = cache.get(cacheKey);
      if (cached) processed$ = of(cached);
      else {
        assert(expired.nonce.eq(channel.partner.nextNonce), 'nonce mismatch');
        assert(
          state.blockNumber >= withdrawMeta.expiration + confirmationBlocks,
          'expire block not confirmed yet',
        );
        const processed: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: expired.message_identifier,
        };
        processed$ = from(signMessage(signer, processed, { log })).pipe(
          tap((signed) => cache.put(cacheKey, signed)),
        );
      }

      return processed$.pipe(
        mergeMap(function* (processed) {
          // as we've received and validated this message, emit failure to increment nextNonce
          yield withdrawExpire.success({ message: expired }, withdrawMeta);
          // emits withdrawCompleted to clear messages from partner's pendingWithdraws array
          yield withdrawCompleted(undefined, withdrawMeta);
          yield messageSend.request(
            { message: processed },
            { address: partner, msgId: processed.message_identifier.toString() },
          );
        }),
      );
    }),
    catchError((err) => of(withdrawExpire.failure(err, withdrawMeta))),
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
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
) => {
  const processedCache = new LruCache<string, Signed<Processed>>(32);
  const state$ = deps.latest$.pipe(pluckDistinct('state')); // replayed(1)' state$
  return merge(
    action$.pipe(
      filter(
        isActionOf([
          transfer.request,
          transferUnlock.request,
          transferExpire.request,
          withdraw.request,
          withdrawExpire.request,
        ]),
      ),
    ),
    // merge separatedly, to filter per message type before concat
    action$.pipe(
      filter(
        isMessageReceivedOfType([
          Signed(LockedTransfer),
          Signed(Unlock),
          Signed(LockExpired),
          Signed(WithdrawRequest),
          Signed(WithdrawConfirmation),
          Signed(WithdrawExpired),
        ]),
      ),
    ),
  ).pipe(
    concatMap((action) => {
      let output$;
      switch (action.type) {
        case transfer.request.type:
          output$ = sendTransferSigned(state$, action, deps);
          break;
        case transferUnlock.request.type:
          output$ = sendTransferUnlocked(state$, action, deps);
          break;
        case transferExpire.request.type:
          output$ = sendTransferExpired(state$, action, deps);
          break;
        case withdraw.request.type:
          output$ = sendWithdrawRequest(state$, action, deps);
          break;
        case withdrawExpire.request.type:
          output$ = sendWithdrawExpired(state$, action, deps);
          break;
        case messageReceived.type:
          switch (action.payload.message.type) {
            case MessageType.LOCKED_TRANSFER:
              output$ = receiveTransferSigned(
                state$,
                action as messageReceivedTyped<Signed<LockedTransfer>>,
                deps,
              );
              break;
            case MessageType.UNLOCK:
              output$ = receiveTransferUnlocked(
                state$,
                action as messageReceivedTyped<Signed<Unlock>>,
                deps,
              );
              break;
            case MessageType.LOCK_EXPIRED:
              output$ = receiveTransferExpired(
                state$,
                action as messageReceivedTyped<Signed<LockExpired>>,
                deps,
              );
              break;
            case MessageType.WITHDRAW_REQUEST:
              output$ = receiveWithdrawRequest(
                state$,
                action as messageReceivedTyped<Signed<WithdrawRequest>>,
                deps,
              );
              break;
            case MessageType.WITHDRAW_CONFIRMATION:
              output$ = receiveWithdrawConfirmation(
                state$,
                action as messageReceivedTyped<Signed<WithdrawConfirmation>>,
                deps,
              );
              break;
            case MessageType.WITHDRAW_EXPIRED:
              output$ = receiveWithdrawExpired(
                state$,
                action as messageReceivedTyped<Signed<WithdrawExpired>>,
                deps,
                processedCache,
              );
              break;
          }
          break;
      }
      return output$;
    }),
  );
};
