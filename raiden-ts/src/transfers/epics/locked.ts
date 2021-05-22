import { BigNumber } from '@ethersproject/bignumber';
import { Zero } from '@ethersproject/constants';
import type { Observable } from 'rxjs';
import { combineLatest, defer, EMPTY, from, merge, of } from 'rxjs';
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

import type { RaidenAction } from '../../actions';
import type { ChannelEnd } from '../../channels/state';
import { ChannelState } from '../../channels/state';
import type { Lock } from '../../channels/types';
import { channelAmounts, channelKey, channelUniqueKey } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { Capabilities } from '../../constants';
import { messageReceived, messageSend } from '../../messages/actions';
import type { Processed, SecretRequest } from '../../messages/types';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Unlock,
  WithdrawConfirmation,
  WithdrawExpired,
  WithdrawRequest,
} from '../../messages/types';
import type { messageReceivedTyped } from '../../messages/utils';
import {
  getBalanceProofFromEnvelopeMessage,
  isMessageReceivedOfType,
  signMessage,
} from '../../messages/utils';
import type { RaidenState } from '../../state';
import { matrixPresence } from '../../transport/actions';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { assert } from '../../utils';
import { isActionOf } from '../../utils/actions';
import { ErrorCodes, RaidenError } from '../../utils/error';
import { LruCache } from '../../utils/lru';
import { completeWith, pluckDistinct } from '../../utils/rx';
import type { Address, Hash, Int } from '../../utils/types';
import { decode, Signed, UInt, untime } from '../../utils/types';
import {
  transfer,
  transferExpire,
  transferExpireProcessed,
  transferProcessed,
  transferSecret,
  transferSecretRequest,
  transferSigned,
  transferUnlock,
  transferUnlockProcessed,
  withdraw,
  withdrawCompleted,
  withdrawExpire,
  withdrawMessage,
} from '../actions';
import type { TransferState } from '../state';
import { Direction } from '../state';
import { getLocksroot, getSecrethash, getTransfer, makeMessageId, transferKey } from '../utils';
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
 * @param config.confirmationBlocks - Confirmations block config
 * @param config.expiryFactor - The factor that the reveal timeouts gets multiplied with to calculate the lock expiration
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
  { revealTimeout, confirmationBlocks, expiryFactor }: RaidenConfig,
  { log, address, network, signer }: RaidenEpicDeps,
): Observable<transferSecret | transferSigned> {
  const { tokenNetwork, fee, partner, userId } = action.payload;
  const channel = getOpenChannel(state, { tokenNetwork, partner });

  assert(
    !action.payload.expiration || action.payload.expiration > state.blockNumber + revealTimeout,
    'expiration too soon',
  );
  const expiration = BigNumber.from(
    action.payload.expiration ||
      Math.min(
        state.blockNumber + Math.round(revealTimeout * expiryFactor),
        state.blockNumber + channel.settleTimeout - confirmationBlocks,
      ),
  ) as UInt<32>;
  assert(expiration.lte(state.blockNumber + channel.settleTimeout), [
    'expiration too far in the future',
    {
      expiration: expiration.toString(),
      blockNumber: state.blockNumber,
      settleTimeout: channel.settleTimeout,
      revealTimeout,
    },
  ]);
  const lock: Lock = {
    // fee is added to the lock amount; overflow is checked on locksSum below
    amount: action.payload.value.add(fee) as UInt<32>,
    expiration,
    secrethash: action.meta.secrethash,
  };
  const locks = [...channel.own.locks, lock];
  const locksSum = totalLocked(locks);
  assert(
    UInt(32).is(channel.own.balanceProof.transferredAmount.add(locksSum)),
    'overflow on future transferredAmount',
  );
  const locksroot = getLocksroot(locks);

  log.info(
    'Signing transfer of value',
    action.payload.value.toString(),
    'of token',
    channel.token,
    ', to',
    action.payload.target,
    ', through routes',
    action.payload.metadata.routes,
    ', paying',
    fee.toString(),
    'in fees.',
  );

  const message: LockedTransfer = {
    type: MessageType.LOCKED_TRANSFER,
    message_identifier: makeMessageId(),
    chain_id: BigNumber.from(network.chainId) as UInt<32>,
    token_network_address: action.payload.tokenNetwork,
    channel_identifier: BigNumber.from(channel.id) as UInt<32>,
    nonce: channel.own.nextNonce,
    transferred_amount: channel.own.balanceProof.transferredAmount,
    locked_amount: locksSum,
    locksroot,
    payment_identifier: action.payload.paymentId,
    token: channel.token,
    recipient: partner,
    lock,
    target: action.payload.target,
    initiator: action.payload.initiator ?? address,
    metadata: action.payload.metadata, // passthrough unchanged metadata
  };

  return from(signMessage(signer, message, { log })).pipe(
    mergeMap(function* (signed) {
      // messageSend LockedTransfer handled by transferRetryMessageEpic
      yield transferSigned({ message: signed, fee, partner, userId }, action.meta);
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
    mergeMap(([state, config]) => {
      if (deps.db.storageKeys.has(transferKey(action.meta))) {
        // don't throw to avoid emitting transfer.failure, to just wait for already pending transfer
        deps.log.warn('transfer already present', action.meta);
        return EMPTY;
      }
      return makeAndSignTransfer$(state, action, config, deps);
    }),
    catchError((err) => of(transfer.failure(err, action.meta))),
  );
}

/**
 * Contains the core logic of {@link makeAndSignUnlock}.
 *
 * @param state$ - Observable of the latest app state.
 * @param state - Contains The current state of the app
 * @param action - The transfer unlock action that will generate the transferUnlock.success action.
 * @param transferState - Transfer's state
 * @param deps - Epics dependencies
 * @param deps.signer - The signer that will sign the message
 * @param deps.log - Logger instance
 * @returns Observable of {@link transferUnlock.success} action.
 */
function makeAndSignUnlock$(
  state$: Observable<RaidenState>,
  state: RaidenState,
  action: transferUnlock.request,
  transferState: TransferState,
  { log, signer }: Pick<RaidenEpicDeps, 'log' | 'signer'>,
): Observable<transferUnlock.success> {
  const secrethash = action.meta.secrethash;
  const locked = transferState.transfer;
  const tokenNetwork = locked.token_network_address;
  const partner = transferState.partner;
  const channel = getOpenChannel(state, { tokenNetwork, partner });

  let signed$: Observable<Signed<Unlock>>;
  if (transferState.unlock) {
    // unlock already signed, use cached
    signed$ = of(transferState.unlock!);
  } else {
    assert(transferState.secret, 'unknown secret'); // never fails because we wait before
    assert(
      channel.own.locks.find((lock) => lock.secrethash === secrethash),
      'transfer already unlocked or expired',
    );
    // don't forget to check after signature too, may have expired by then
    // allow unlocking past expiration if secret registered on-chain
    assert(
      transferState.secretRegistered || transferState.expiration > state.blockNumber,
      'lock expired',
    );

    const message: Unlock = {
      type: MessageType.UNLOCK,
      message_identifier: makeMessageId(),
      chain_id: locked.chain_id,
      token_network_address: locked.token_network_address,
      channel_identifier: locked.channel_identifier,
      nonce: channel.own.nextNonce,
      transferred_amount: decode(
        UInt(32),
        channel.own.balanceProof.transferredAmount.add(locked.lock.amount),
        'overflow on transferredAmount',
      ),
      locked_amount: channel.own.balanceProof.lockedAmount.sub(locked.lock.amount) as UInt<32>,
      locksroot: getLocksroot(withoutLock(channel.own, secrethash)),
      payment_identifier: locked.payment_identifier,
      secret: transferState.secret,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    withLatestFrom(state$),
    map(([signed, state]) => {
      const transferState = state.transfers[transferKey(action.meta)];
      const channel = getOpenChannel(state, { tokenNetwork, partner });
      assert(
        transferState.expiration > state.blockNumber ||
          transferState.secretRegistered ||
          channel.own.locks.find((lock) => lock.secrethash === secrethash && lock.registered),
        'lock expired',
      );
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
 * @param deps.db - Database instance
 * @returns Observable of transferUnlock.success actions
 */
function sendTransferUnlocked(
  state$: Observable<RaidenState>,
  action: transferUnlock.request,
  { signer, log, db }: RaidenEpicDeps,
): Observable<transferUnlock.success | transferUnlock.failure> {
  return defer(() => getTransfer(state$, db, action.meta)).pipe(
    withLatestFrom(state$),
    mergeMap(([transferState, state]) =>
      makeAndSignUnlock$(state$, state, action, transferState, { log, signer }),
    ),
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
 * @param transferState - State of the transfer
 * @param deps - RaidenEpicDeps members
 * @param deps.signer - Signer instance
 * @param deps.log - Logger instance
 * @returns Observable of transferExpire.success actions
 */
function makeAndSignLockExpired$(
  state: RaidenState,
  action: transferExpire.request,
  transferState: TransferState,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferExpire.success> {
  const secrethash = action.meta.secrethash;
  const locked = transferState.transfer;
  const tokenNetwork = locked.token_network_address;
  const partner = transferState.partner;
  const channel = getOpenChannel(state, { tokenNetwork, partner });

  let signed$: Observable<Signed<LockExpired>>;
  if (transferState.expired) {
    // expired already signed, use cached
    signed$ = of(transferState.expired!);
  } else {
    assert(locked.lock.expiration.lt(state.blockNumber), 'lock not yet expired');
    assert(
      channel.own.locks.find((lock) => lock.secrethash === secrethash) && !transferState.unlock,
      'transfer already unlocked or expired',
    );

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
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.db - Database instance
 * @returns Observable of transferExpire.success|transferExpire.failure actions
 */
function sendTransferExpired(
  state$: Observable<RaidenState>,
  action: transferExpire.request,
  { log, signer, db }: RaidenEpicDeps,
): Observable<transferExpire.success | transferExpire.failure> {
  return defer(() => getTransfer(state$, db, action.meta)).pipe(
    withLatestFrom(state$),
    mergeMap(([transferState, state]) =>
      makeAndSignLockExpired$(state, action, transferState, { signer, log }),
    ),
    catchError((err) => of(transferExpire.failure(err, action.meta))),
  );
}

function receiveTransferSigned(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<LockedTransfer>>,
  { address, log, signer, config$, db }: RaidenEpicDeps,
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
      const locked: Signed<LockedTransfer> = action.payload.message;
      if (db.storageKeys.has(transferKey(meta))) {
        log.warn('transfer already present', meta);
        const msgId = locked.message_identifier;
        const transferState = state.transfers[transferKey(meta)];
        // if transfer matches the stored one, re-send Processed once
        if (
          transferState?.transferProcessed &&
          transferState.partner === action.meta.address &&
          msgId.eq(transferState.transfer.message_identifier)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(
            transferProcessed({ message: untime(transferState.transferProcessed!) }, meta),
          );
        }
        return EMPTY;
      }

      // full balance proof validation
      const tokenNetwork = locked.token_network_address;
      const partner = action.meta.address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, locked);
      assert(locked.nonce.eq(channel.partner.nextNonce), [
        'nonce mismatch',
        { expected: channel.partner.nextNonce.toNumber(), received: locked.nonce.toNumber() },
      ]);

      const locks = [...channel.partner.locks, locked.lock];
      const locksroot = getLocksroot(locks);
      assert(locked.locksroot === locksroot, 'locksroot mismatch');
      assert(
        locked.transferred_amount.eq(channel.partner.balanceProof.transferredAmount),
        'transferredAmount mismatch',
      );
      const locksSum = totalLocked(locks);
      assert(locked.locked_amount.eq(locksSum), 'lockedAmount mismatch');
      assert(
        UInt(32).is(channel.partner.balanceProof.transferredAmount.add(locksSum)),
        'overflow on future transferredAmount',
      );

      const { partnerCapacity } = channelAmounts(channel);
      assert(
        locked.lock.amount.lte(partnerCapacity),
        'balanceProof total amount bigger than capacity',
      );
      assert(locked.lock.expiration.lte(state.blockNumber + channel.settleTimeout), [
        'expiration too far in the future',
        {
          expiration: locked.lock.expiration.toString(),
          blockNumber: state.blockNumber,
          settleTimeout: channel.settleTimeout,
          revealTimeout,
        },
      ]);
      // accept expired transfers, to apply state change and stay in sync
      // with partner, so we can receive later LockExpired and transfers on top of it

      assert(locked.recipient === address, "Received transfer isn't for us");

      log.info(
        'Receiving transfer of value',
        locked.lock.amount.toString(),
        'of token',
        channel.token,
        ', from',
        locked.initiator,
        ', through partner',
        partner,
      );

      let request$: Observable<Signed<SecretRequest> | undefined> = of(undefined);
      if (locked.target === address) {
        let ignoredDetails;
        if (!getCap(caps, Capabilities.RECEIVE)) ignoredDetails = { reason: 'receiving disabled' };
        else if (!locked.lock.expiration.sub(revealTimeout).gt(state.blockNumber))
          ignoredDetails = {
            reason: 'lock expired or expires too soon',
            lockExpiration: locked.lock.expiration.toString(),
            dangerZoneStart: locked.lock.expiration.sub(revealTimeout).toString(),
          };
        if (!ignoredDetails) {
          request$ = defer(async () => {
            const request: SecretRequest = {
              type: MessageType.SECRET_REQUEST,
              payment_identifier: locked.payment_identifier,
              secrethash,
              amount: locked.lock.amount,
              expiration: locked.lock.expiration,
              message_identifier: makeMessageId(),
            };
            return signMessage(signer, request, { log });
          });
        } else {
          log.warn('Ignoring received transfer', ignoredDetails);
        }
      }

      const processed$ = defer(() => {
        const processed: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: locked.message_identifier,
        };
        return signMessage(signer, processed, { log });
      });

      // if any of these signature prompts fail, none of these actions will be emitted
      return combineLatest([processed$, request$]).pipe(
        mergeMap(function* ([processed, request]) {
          yield transferSigned({ message: locked, fee: Zero as Int<32>, partner }, meta);
          // sets TransferState.transferProcessed
          yield transferProcessed({ message: processed }, meta);
          if (request) {
            // request initiator's presence, to be able to request secret
            yield matrixPresence.request(undefined, { address: locked.initiator });
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
  { log, signer, db }: RaidenEpicDeps,
) {
  const secrethash = getSecrethash(action.payload.message.secret);
  const meta = { secrethash, direction: Direction.RECEIVED };
  // db.get will throw if not found, being handled on final catchError
  return defer(() => getTransfer(state$, db, meta)).pipe(
    withLatestFrom(state$),
    mergeMap(([transferState, state]) => {
      assert(transferState, 'unknown transfer');

      const unlock: Signed<Unlock> = action.payload.message;
      const partner = action.meta.address;
      assert(partner === transferState.partner, 'wrong partner');
      // may race on db.get, but will validate on synchronous channel state reducer
      assert(!transferState.expired, 'already expired');

      if (transferState.unlock) {
        log.warn('transfer already unlocked', action.meta);
        // if message matches the stored one, re-send Processed once
        if (
          transferState.unlockProcessed &&
          unlock.message_identifier.eq(transferState.unlockProcessed.message_identifier)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(
            transferUnlockProcessed({ message: untime(transferState.unlockProcessed!) }, meta),
          );
        } else return EMPTY;
      }
      const locked = transferState.transfer;
      assert(unlock.token_network_address === locked.token_network_address, 'wrong tokenNetwork');

      // unlock validation
      const tokenNetwork = unlock.token_network_address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, unlock);
      assert(unlock.nonce.eq(channel.partner.nextNonce), [
        'nonce mismatch',
        { expected: channel.partner.nextNonce.toNumber(), received: unlock.nonce.toNumber() },
      ]);

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
          if (!transferState.secret) yield transferSecret({ secret: unlock.secret }, meta);
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
  { log, signer, config$, db }: RaidenEpicDeps,
) {
  const secrethash = action.payload.message.secrethash;
  const meta = { secrethash, direction: Direction.RECEIVED };
  // db.get will throw if not found, being handled on final catchError
  return defer(() => getTransfer(state$, db, meta)).pipe(
    withLatestFrom(state$, config$),
    mergeMap(([transferState, state, { confirmationBlocks }]) => {
      const expired: Signed<LockExpired> = action.payload.message;
      const partner = action.meta.address;
      assert(partner === transferState.partner, 'wrong partner');
      // may race on db.get, but will validate on synchronous channel state reducer
      assert(!transferState.unlock, 'transfer unlocked');

      if (transferState.expired) {
        log.warn('transfer already expired', action.meta);
        // if message matches the stored one, re-send Processed once
        if (
          transferState.expiredProcessed &&
          expired.message_identifier.eq(transferState.expiredProcessed.message_identifier)
        ) {
          // transferProcessed again will trigger messageSend.request
          return of(
            transferExpireProcessed({ message: untime(transferState.expiredProcessed!) }, meta),
          );
        } else return EMPTY;
      }
      const locked = transferState.transfer;

      // expired validation
      assert(
        locked.lock.expiration.add(confirmationBlocks).lte(state.blockNumber),
        'expiration block not confirmed yet',
      );
      assert(!transferState.secretRegistered, 'secret registered onchain');
      assert(expired.token_network_address === locked.token_network_address, 'wrong tokenNetwork');

      const tokenNetwork = expired.token_network_address;
      const channel = getOpenChannel(state, { tokenNetwork, partner }, expired);
      assert(expired.nonce.eq(channel.partner.nextNonce), [
        'nonce mismatch',
        { expected: channel.partner.nextNonce.toNumber(), received: expired.nonce.toNumber() },
      ]);

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
 * @returns Observable of withdrawMessage.request|withdraw.failure actions
 */
function sendWithdrawRequest(
  state$: Observable<RaidenState>,
  action: withdraw.request,
  { log, address, signer, network, config$ }: RaidenEpicDeps,
): Observable<withdrawMessage.request | withdraw.failure> {
  if (action.meta.direction !== Direction.SENT) return EMPTY;
  return combineLatest([state$, config$]).pipe(
    first(),
    mergeMap(([state, { revealTimeout }]) => {
      const channel = getOpenChannel(state, action.meta);
      if (
        channel.own.pendingWithdraws.some(matchWithdraw(MessageType.WITHDRAW_REQUEST, action.meta))
      )
        return EMPTY; // already requested, skip without failing
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
        chain_id: BigNumber.from(network.chainId) as UInt<32>,
        token_network_address: action.meta.tokenNetwork,
        channel_identifier: BigNumber.from(channel.id) as UInt<32>,
        participant: address,
        total_withdraw: action.meta.totalWithdraw,
        nonce: channel.own.nextNonce,
        expiration: BigNumber.from(action.meta.expiration) as UInt<32>,
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
        assert(request.nonce.eq(channel.partner.nextNonce), [
          'nonce mismatch',
          { expected: channel.partner.nextNonce.toNumber(), received: request.nonce.toNumber() },
        ]);
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
        assert(expired.nonce.eq(channel.partner.nextNonce), [
          'nonce mismatch',
          { expected: channel.partner.nextNonce.toNumber(), received: expired.nonce.toNumber() },
        ]);
        assert(
          state.blockNumber >= withdrawMeta.expiration + confirmationBlocks,
          'expire block not confirmed yet',
        );
        const processed: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: expired.message_identifier,
        };
        processed$ = from(signMessage(signer, processed, { log })).pipe(
          tap((signed) => cache.set(cacheKey, signed)),
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
export function transferGenerateAndSignEnvelopeMessageEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
) {
  const processedCache = new LruCache<string, Signed<Processed>>(32);
  const state$ = deps.latest$.pipe(pluckDistinct('state'), completeWith(action$)); // replayed(1)' state$
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
}
