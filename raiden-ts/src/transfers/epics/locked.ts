/* eslint-disable @typescript-eslint/camelcase */
import { One, Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';
import { findKey, get, isMatchWith, pick } from 'lodash';
import { combineLatest, EMPTY, from, Observable, of } from 'rxjs';
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

import { RaidenAction } from '../../actions';
import { Channel, ChannelState } from '../../channels/state';
import { Lock, SignedBalanceProof } from '../../channels/types';
import { RaidenConfig } from '../../config';
import {
  LockedTransfer,
  LockExpired,
  MessageType,
  Metadata,
  Unlock,
  WithdrawConfirmation,
  WithdrawRequest,
} from '../../messages/types';
import { signMessage } from '../../messages/utils';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { LruCache } from '../../utils/lru';
import { pluckDistinct } from '../../utils/rx';
import { Address, assert, BigNumberC, Hash, Signed, UInt } from '../../utils/types';
import {
  transfer,
  transferExpire,
  transferSecret,
  transferSigned,
  transferUnlock,
  withdrawReceive,
} from '../actions';
import { getLocksroot, makeMessageId } from '../utils';

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

function getChannelLocksroot(channel: Channel, secrethash: Hash): Hash {
  const locks: Lock[] = (channel.own.locks || []).filter(l => l.secrethash !== secrethash);
  return getLocksroot(locks);
}

/**
 * THe core logic of {@link makeAndSignTransfer}.
 *
 * @param state - Contains The current state of the app
 * @param action - transfer request action to be sent.
 * @param revealTimeout - The reveal timeout for the transfer.
 * @param deps - {@link RaidenEpicDeps}
 * @returns Observable of {@link transferSecret} or {@link transferSigned} actions
 */
function makeAndSignTransfer$(
  state: RaidenState,
  action: transfer.request,
  { revealTimeout }: RaidenConfig,
  deps: RaidenEpicDeps,
): Observable<transferSecret | transferSigned> {
  const { log, address, network, signer } = deps;
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
  const recipient = action.payload.paths[0].path[0];

  const channel: Channel | undefined = state.channels[action.payload.tokenNetwork][recipient];
  // check below shouldn't fail because of route validation in pathFindServiceEpic
  // used here mostly for type narrowing on channel union
  assert(channel && channel.state === ChannelState.open, 'not open');

  const lock: Lock = {
    amount: action.payload.value.add(fee) as UInt<32>, // fee is added to the lock amount
    expiration: bigNumberify(state.blockNumber + revealTimeout * 2) as UInt<32>,
    secrethash: action.meta.secrethash,
  };
  const locks: Lock[] = [...(channel.own.locks || []), lock];
  const locksroot = getLocksroot(locks);
  const token = findKey(state.tokens, tn => tn === action.payload.tokenNetwork)! as Address;

  log.info(
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
    locked_amount: (channel.own.balanceProof ? channel.own.balanceProof.lockedAmount : Zero).add(
      lock.amount,
    ) as UInt<32>,
    locksroot,
    payment_identifier: action.payload.paymentId,
    token,
    recipient,
    lock,
    target: action.payload.target,
    initiator: address,
    metadata,
  };
  return from(signMessage(signer, message, { log })).pipe(
    mergeMap(function*(signed) {
      // messageSend LockedTransfer handled by transferSignedRetryMessageEpic
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
    catchError(err => of(transfer.failure(err, action.meta))),
  );
}

/**
 * Contains the core logic of {@link makeAndSignUnlock}.
 *
 * @param state$ - Observable of the latest app state.
 * @param state - Contains The current state of the app
 * @param action - The transfer unlock action that will generate the transferUnlock.success action.
 * @param signer - The signer that will sign the message
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
  const channel: Channel | undefined = get(state.channels, [
    transfer.token_network_address,
    transfer.recipient,
  ]);
  // shouldn't happen, channel close clears transfers, but unlock may already have been queued
  assert(
    channel && channel.state === ChannelState.open && channel.own.balanceProof,
    'channel gone, not open or no balanceProof',
  );

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
    const locksroot = getChannelLocksroot(channel, secrethash);

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
    mergeMap(function*([signed, state]) {
      assert(
        state.sent[secrethash].secret?.[1]?.registerBlock ||
          transfer.lock.expiration.gt(state.blockNumber),
        'lock expired',
      );
      assert(!state.sent[secrethash].channelClosed, 'channel closed!');
      yield transferUnlock.success({ message: signed }, action.meta);
      // messageSend Unlock handled by transferUnlockedRetryMessageEpic
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
 * @param signer - RaidenEpicDeps members
 * @returns Observable of transferUnlock.success actions
 */
function makeAndSignUnlock(
  state$: Observable<RaidenState>,
  action: transferUnlock.request,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferUnlock.success | transferUnlock.failure> {
  return state$.pipe(
    first(),
    mergeMap(state => makeAndSignUnlock$(state$, state, action, { log, signer })),
    catchError(err => {
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
  const channel: Channel | undefined = get(state.channels, [
    transfer.token_network_address,
    transfer.recipient,
  ]);

  assert(
    channel && channel.state === ChannelState.open && channel.own.balanceProof,
    'channel gone, not open or no balanceProof',
  );

  let signed$: Observable<Signed<LockExpired>>;
  if (state.sent[secrethash].lockExpired) {
    // lockExpired already signed, use cached
    signed$ = of(state.sent[secrethash].lockExpired![1]);
  } else {
    assert(transfer.lock.expiration.lt(state.blockNumber), 'lock not yet expired');
    assert(!state.sent[secrethash].unlock, 'transfer already unlocked');

    const locksroot = getChannelLocksroot(channel, secrethash);

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
      recipient: transfer.recipient,
      secrethash,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    // messageSend LockExpired handled by transferExpiredRetryMessageEpic
    map(signed => transferExpire.success({ message: signed }, action.meta)),
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
 * @returns Observable of transferExpire.success|transferExpire.failure actions
 */
function makeAndSignLockExpired(
  state$: Observable<RaidenState>,
  action: transferExpire.request,
  { log, signer }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferExpire.success | transferExpire.failure> {
  return state$.pipe(
    first(),
    mergeMap(state => makeAndSignLockExpired$(state, action, { signer, log })),
    catchError(err => of(transferExpire.failure(err, action.meta))),
  );
}

function makeAndSignWithdrawConfirmation$(
  state: RaidenState,
  action: withdrawReceive.request,
  { log, signer }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
  cache: LruCache<string, Signed<WithdrawConfirmation>>,
) {
  const request = action.payload.message;

  const channel: Channel | undefined = get(state.channels, [
    action.meta.tokenNetwork,
    action.meta.partner,
  ]);
  // check channel is in valid state and requested total_withdraw is valid
  // withdrawable amount is: total_withdraw <= partner.deposit + own.transferredAmount
  assert(
    channel && channel.state === ChannelState.open && request.channel_identifier.eq(channel.id),
    'channel gone or not open',
  );
  assert(request.expiration.gt(state.blockNumber), 'WithdrawRequest expired');
  assert(
    request.total_withdraw.lte(
      channel.partner.deposit.add(
        channel.own.balanceProof ? channel.own.balanceProof.transferredAmount : Zero,
      ),
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
      tap(signed => cache.put(key, signed)),
    );
  }

  return signed$.pipe(map(signed => withdrawReceive.success({ message: signed }, action.meta)));
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
    mergeMap(state => makeAndSignWithdrawConfirmation$(state, action, { log, signer }, cache)),
    catchError(err => {
      log.warn('Error trying to handle WithdrawRequest, ignoring:', err);
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
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  | transferSigned
  | transferSecret
  | transferUnlock.success
  | transferUnlock.failure
  | transfer.failure
  | transferExpire.success
  | transferExpire.failure
  | withdrawReceive.success
> => {
  const withdrawCache = new LruCache<string, Signed<WithdrawConfirmation>>(32);
  const latestState$ = deps.latest$.pipe(pluckDistinct('state'));
  return action$.pipe(
    filter(
      isActionOf([
        transfer.request,
        transferUnlock.request,
        transferExpire.request,
        withdrawReceive.request,
      ]),
    ),
    concatMap(action => {
      switch (action.type) {
        case transfer.request.type:
          return makeAndSignTransfer(latestState$, action, deps);
        case transferUnlock.request.type:
          return makeAndSignUnlock(latestState$, action, deps);
        case transferExpire.request.type:
          return makeAndSignLockExpired(latestState$, action, deps);
        case withdrawReceive.request.type:
          return makeAndSignWithdrawConfirmation(latestState$, action, deps, withdrawCache);
      }
    }),
  );
};
