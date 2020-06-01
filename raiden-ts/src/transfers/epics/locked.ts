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
import isMatchWith from 'lodash/isMatchWith';
import pick from 'lodash/pick';

import { RaidenAction } from '../../actions';
import { RaidenConfig } from '../../config';
import { ChannelState, ChannelEnd } from '../../channels/state';
import { Lock, BalanceProof } from '../../channels/types';
import { channelAmounts, channelKey } from '../../channels/utils';
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
import { assert, BigNumberC, Hash, Signed, UInt, Int } from '../../utils/types';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Capabilities } from '../../constants';
import {
  transfer,
  transferExpire,
  transferSecret,
  transferSigned,
  transferUnlock,
  withdrawReceive,
  transferProcessed,
  transferSecretRequest,
  transferUnlockProcessed,
  transferExpireProcessed,
} from '../actions';
import { getLocksroot, makeMessageId, getSecrethash } from '../utils';
import { Direction } from '../state';

/**
 * Return the next nonce for a (possibly missing) balanceProof, or else BigNumber(1)
 *
 * @param balanceProof - Balance proof to increase nonce from
 * @returns Increased nonce, or One if no balance proof provided
 */
function nextNonce(balanceProof: BalanceProof): UInt<8> {
  return balanceProof.nonce.add(1) as UInt<8>;
}

function withoutLock(end: ChannelEnd, secrethash: Hash): Hash {
  const locks = end.locks.filter((l) => l.secrethash !== secrethash);
  return getLocksroot(locks);
}

/**
 * THe core logic of {@link makeAndSignTransfer}.
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

  const channel =
    state.channels[channelKey({ tokenNetwork: action.payload.tokenNetwork, partner })];
  // check below shouldn't fail because of route validation in pathFindServiceEpic
  // used here mostly for type narrowing on channel union
  assert(channel?.state === ChannelState.open, 'not open');
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
    nonce: nextNonce(channel.own.balanceProof),
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
      yield transferSigned({ message: signed, fee }, action.meta);
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
function makeAndSignTransfer(
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
  const transfer = state.sent[secrethash].transfer[1];
  const partner = state.sent[secrethash].partner;
  const channel =
    state.channels[channelKey({ tokenNetwork: transfer.token_network_address, partner })];
  // shouldn't happen
  assert(channel?.state === ChannelState.open, 'channel not open');

  let signed$: Observable<Signed<Unlock>>;
  if (state.sent[secrethash].unlock) {
    // unlock already signed, use cached
    signed$ = of(state.sent[secrethash].unlock![1]);
  } else {
    // don't forget to check after signature too, may have expired by then
    // allow unlocking past expiration if secret registered
    assert(
      state.sent[secrethash].secret?.[1]?.registerBlock ||
        transfer.lock.expiration.gt(state.blockNumber),
      'lock expired',
    );
    const locksroot = withoutLock(channel.own, secrethash);

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
      locked_amount: channel.own.balanceProof.lockedAmount.sub(transfer.lock.amount) as UInt<32>,
      locksroot,
      payment_identifier: transfer.payment_identifier,
      secret: state.sent[action.meta.secrethash].secret![1].value,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    withLatestFrom(state$),
    mergeMap(function* ([signed, state]) {
      assert(
        state.sent[secrethash].secret?.[1]?.registerBlock ||
          transfer.lock.expiration.gt(state.blockNumber),
        'lock expired',
      );
      assert(!state.sent[secrethash].channelClosed, 'channel closed!');
      yield transferUnlock.success({ message: signed }, action.meta);
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
function makeAndSignUnlock(
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
  const transfer = state.sent[secrethash].transfer[1];
  const partner = state.sent[secrethash].partner;
  const channel =
    state.channels[channelKey({ tokenNetwork: transfer.token_network_address, partner })];

  assert(channel?.state === ChannelState.open, 'channel not open');

  let signed$: Observable<Signed<LockExpired>>;
  if (state.sent[secrethash].lockExpired) {
    // lockExpired already signed, use cached
    signed$ = of(state.sent[secrethash].lockExpired![1]);
  } else {
    assert(transfer.lock.expiration.lt(state.blockNumber), 'lock not yet expired');
    assert(!state.sent[secrethash].unlock, 'transfer already unlocked');

    const locksroot = withoutLock(channel.own, secrethash);

    const message: LockExpired = {
      type: MessageType.LOCK_EXPIRED,
      message_identifier: makeMessageId(),
      chain_id: transfer.chain_id,
      token_network_address: transfer.token_network_address,
      channel_identifier: transfer.channel_identifier,
      nonce: nextNonce(channel.own.balanceProof),
      transferred_amount: channel.own.balanceProof.transferredAmount,
      locked_amount: channel.own.balanceProof.lockedAmount.sub(transfer.lock.amount) as UInt<32>,
      locksroot,
      recipient: partner,
      secrethash,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    // messageSend LockExpired handled by transferRetryMessageEpic
    map((signed) => transferExpire.success({ message: signed }, action.meta)),
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
function makeAndSignLockExpired(
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

function makeAndSignWithdrawConfirmation$(
  state: RaidenState,
  action: withdrawReceive.request,
  { log, signer }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
  cache: LruCache<string, Signed<WithdrawConfirmation>>,
) {
  const request = action.payload.message;

  const channel = state.channels[channelKey(action.meta)];
  // check channel is in valid state and requested total_withdraw is valid
  // withdrawable amount is: total_withdraw <= partner.deposit + own.transferredAmount
  assert(
    channel?.state === ChannelState.open && request.channel_identifier.eq(channel.id),
    'channel not open or wrong id',
  );
  assert(request.expiration.gt(state.blockNumber), 'WithdrawRequest expired');
  assert(
    request.total_withdraw.lte(
      channel.partner.deposit.add(channel.own.balanceProof.transferredAmount),
    ),
    'invalid total_withdraw, greater than partner.deposit + own.transferredAmount',
  );

  let signed$: Observable<Signed<WithdrawConfirmation>>;
  const key = request.message_identifier.toString();

  // compare WithdrawRequest and a possible signed WithdrawConfirmation
  function compareReqConf(
    req: WithdrawRequest,
    conf: Signed<WithdrawConfirmation> | undefined,
  ): conf is Signed<WithdrawConfirmation> {
    if (!conf) return false;
    const matchSet = pick(conf, [
      'token_network_address',
      'participant',
      'chain_id',
      'channel_identifier',
      'total_withdraw',
      'expiration',
    ]);
    return isMatchWith(req, matchSet, (objVal, othVal) =>
      BigNumberC.is(objVal)
        ? objVal.eq(othVal)
        : BigNumberC.is(othVal)
        ? othVal.eq(objVal)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (undefined as any),
    );
  }
  const cached = cache.get(key);
  // ensure all parameters are equal the cached one before returning it, or else sign again
  if (compareReqConf(request, cached)) {
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
    signed$ = from(signMessage(signer, confirmation, { log })).pipe(
      tap((signed) => cache.put(key, signed)),
    );
  }

  return signed$.pipe(map((signed) => withdrawReceive.success({ message: signed }, action.meta)));
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
 * @param signer.signer - Signer instance
 * @param signer.log - Logger instance
 * @param cache - A Map to store and reuse previously Signed<WithdrawConfirmation>
 * @returns Observable of transferExpire.success|transferExpire.failure actions
 */
function makeAndSignWithdrawConfirmation(
  state$: Observable<RaidenState>,
  action: withdrawReceive.request,
  { signer, log }: RaidenEpicDeps,
  cache: LruCache<string, Signed<WithdrawConfirmation>>,
): Observable<withdrawReceive.success> {
  return state$.pipe(
    first(),
    mergeMap((state) => makeAndSignWithdrawConfirmation$(state, action, { log, signer }, cache)),
    catchError((err) => {
      log.warn('Error trying to handle WithdrawRequest, ignoring:', err);
      return EMPTY;
    }),
  );
}

function receiveTransferSigned(
  state$: Observable<RaidenState>,
  action: messageReceivedTyped<Signed<LockedTransfer>>,
  { address, log, network, signer, config$ }: RaidenEpicDeps,
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
      const channel = state.channels[channelKey({ tokenNetwork, partner })];
      assert(channel?.state === ChannelState.open, 'channel not open');
      assert(transfer.chain_id.eq(network.chainId), 'chainId mismatch');
      assert(transfer.channel_identifier.eq(channel.id), 'channelId mismatch');
      assert(transfer.nonce.eq(nextNonce(channel.partner.balanceProof)), 'nonce mismatch');
      assert(
        transfer.transferred_amount.eq(channel.partner.balanceProof.transferredAmount),
        'transferredAmount mismatch',
      );
      assert(
        transfer.locked_amount.eq(
          channel.partner.balanceProof.lockedAmount.add(transfer.lock.amount),
        ),
        'lockedAmount mismatch',
      );

      const partnerCapacity = channelAmounts(channel).partnerCapacity;
      assert(
        transfer.lock.amount.lte(partnerCapacity),
        'balanceProof total amount bigger than capacity',
      );

      assert(transfer.recipient === address, "Received transfer isn't for us");

      assert(
        transfer.lock.expiration.sub(state.blockNumber).gt(revealTimeout),
        'lock expires too soon',
      );
      const locksroot = getLocksroot([...channel.partner.locks, transfer.lock]);
      assert(transfer.locksroot === locksroot, 'locksroot mismatch');

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
      if (!caps?.[Capabilities.NO_RECEIVE] && transfer.target === address)
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
          yield transferSigned({ message: transfer, fee: Zero as Int<32> }, meta);
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
  { log, network, signer }: RaidenEpicDeps,
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
      const transf = received.transfer[1];

      // unlock validation
      const tokenNetwork = unlock.token_network_address;
      assert(tokenNetwork === transf.token_network_address, 'wrong tokenNetwork');

      const channel = state.channels[channelKey({ tokenNetwork, partner })];
      assert(channel?.state === ChannelState.open, 'channel not open');
      assert(unlock.chain_id.eq(network.chainId), 'chainId mismatch');
      assert(unlock.channel_identifier.eq(channel.id), 'channelId mismatch');
      assert(unlock.nonce.eq(nextNonce(channel.partner.balanceProof)), 'nonce mismatch');

      const lock = transf.lock;
      const amount = lock.amount;
      assert(
        unlock.transferred_amount.eq(channel.partner.balanceProof.transferredAmount.add(amount)),
        'transferredAmount mismatch',
      );
      assert(
        unlock.locked_amount.eq(channel.partner.balanceProof.lockedAmount.sub(amount)),
        'lockedAmount mismatch',
      );

      const locksroot = withoutLock(channel.partner, secrethash);
      assert(unlock.locksroot === locksroot, 'locksroot mismatch');

      const processed: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: unlock.message_identifier,
      };
      // if any of these signature prompts fail, none of these actions will be emitted
      return from(signMessage(signer, processed, { log })).pipe(
        mergeMap(function* (processed) {
          yield transferUnlock.success({ message: unlock }, meta);
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
  { log, network, signer, config$ }: RaidenEpicDeps,
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
      const transf = received.transfer[1];

      // lockExpired validation
      assert(
        transf.lock.expiration.add(confirmationBlocks).lte(state.blockNumber),
        'expiration block not confirmed yet',
      );
      assert(!received.unlock, 'transfer unlocked');
      assert(!received.secret?.[1]?.registerBlock, 'secret registered');

      const tokenNetwork = expired.token_network_address;
      assert(tokenNetwork === transf.token_network_address, 'wrong tokenNetwork');

      const channel = state.channels[channelKey({ tokenNetwork, partner })];
      assert(channel?.state === ChannelState.open, 'channel not open');
      assert(expired.chain_id.eq(network.chainId), 'chainId mismatch');
      assert(expired.channel_identifier.eq(channel.id), 'channelId mismatch');
      assert(expired.nonce.eq(nextNonce(channel.partner.balanceProof)), 'nonce mismatch');

      const lock = transf.lock;
      const amount = lock.amount;
      assert(
        expired.transferred_amount.eq(channel.partner.balanceProof.transferredAmount),
        'transferredAmount mismatch',
      );
      assert(
        expired.locked_amount.eq(channel.partner.balanceProof.lockedAmount.sub(amount)),
        'lockedAmount mismatch',
      );

      const locks: Lock[] = channel.partner.locks.filter((lock) => lock.secrethash !== secrethash);
      const locksroot = getLocksroot(locks);
      assert(expired.locksroot === locksroot, 'locksroot mismatch');

      const processed: Processed = {
        type: MessageType.PROCESSED,
        message_identifier: expired.message_identifier,
      };
      // if any of these signature prompts fail, none of these actions will be emitted
      return from(signMessage(signer, processed, { log })).pipe(
        mergeMap(function* (processed) {
          yield transferExpire.success({ message: expired }, meta);
          // sets TransferState.transferProcessed
          yield transferExpireProcessed({ message: processed }, meta);
          yield transfer.failure(
            new RaidenError(ErrorCodes.XFER_EXPIRED, {
              block: transf.lock.expiration.toString(),
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
  const withdrawCache = new LruCache<string, Signed<WithdrawConfirmation>>(32);
  const state$ = deps.latest$.pipe(pluckDistinct('state')); // replayed(1)' state$
  return merge(
    action$.pipe(
      filter(
        isActionOf([
          transfer.request,
          transferUnlock.request,
          transferExpire.request,
          withdrawReceive.request,
        ]),
      ),
    ),
    // merge separatedly, to filter per message type before concat
    action$.pipe(
      filter(
        isMessageReceivedOfType([Signed(LockedTransfer), Signed(Unlock), Signed(LockExpired)]),
      ),
    ),
  ).pipe(
    concatMap((action) =>
      transfer.request.is(action)
        ? makeAndSignTransfer(state$, action, deps)
        : transferUnlock.request.is(action)
        ? makeAndSignUnlock(state$, action, deps)
        : transferExpire.request.is(action)
        ? makeAndSignLockExpired(state$, action, deps)
        : withdrawReceive.request.is(action)
        ? makeAndSignWithdrawConfirmation(state$, action, deps, withdrawCache)
        : action.payload.message.type === MessageType.LOCKED_TRANSFER
        ? receiveTransferSigned(
            state$,
            action as messageReceivedTyped<Signed<LockedTransfer>>,
            deps,
          )
        : action.payload.message.type === MessageType.UNLOCK
        ? receiveTransferUnlocked(state$, action as messageReceivedTyped<Signed<Unlock>>, deps)
        : receiveTransferExpired(
            state$,
            action as messageReceivedTyped<Signed<LockExpired>>,
            deps,
          ),
    ),
  );
};
