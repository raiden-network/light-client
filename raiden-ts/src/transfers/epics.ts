/* eslint-disable @typescript-eslint/camelcase */
import {
  combineLatest,
  EMPTY,
  from,
  merge,
  MonoTypeOperatorFunction,
  Observable,
  of,
  defer,
} from 'rxjs';
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
  repeatWhen,
  take,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { bigNumberify } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';
import { findKey, get, pick, isMatchWith } from 'lodash';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { Address, assert, Hash, Signed, UInt, BigNumberC } from '../utils/types';
import { isActionOf, isResponseOf } from '../utils/actions';
import { LruCache } from '../utils/lru';
import { messageReceived, messageSend } from '../messages/actions';
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
import { channelClose, newBlock } from '../channels/actions';
import { RaidenConfig } from '../config';
import { matrixPresence } from '../transport/actions';
import { pluckDistinct } from '../utils/rx';
import {
  transfer,
  transferExpire,
  transferExpireProcessed,
  transferProcessed,
  transferRefunded,
  transferSecret,
  transferSecretRequest,
  transferSecretReveal,
  transferSigned,
  transferUnlock,
  transferUnlockProcessed,
  withdrawReceive,
} from './actions';
import { getLocksroot, getSecrethash, makeMessageId } from './utils';

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

/**
 * Dispatches an actions and waits until a condition is satisfied.
 *
 * @param action$ - Observable of actions that will be monitored
 * @param request - The request/action that will be dispatched
 * @param predicate - The condition that will that was to be satisfied for the observable to
 * complete
 * @returns Observable of the request type.
 */
function dispatchAndWait$<A extends RaidenAction>(
  action$: Observable<RaidenAction>,
  request: A,
  predicate: (action: RaidenAction) => boolean,
): Observable<A> {
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
  // Resubscribe/retry every 30s after messageSend succeeds
  // Notice first (or any) messageSend.request can wait for a long time before succeeding, as it
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

function retrySendUntil$(
  send: messageSend.request,
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  predicate: (state: RaidenState) => boolean,
): Observable<messageSend.request> {
  return dispatchAndWait$(action$, send, isResponseOf(messageSend, send.meta)).pipe(
    retryUntil(state$.pipe(filter(predicate))),
  );
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
  const { log } = deps;
  const { address, network, signer } = deps;
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
      // besides transferSigned, also yield transferSecret (for registering) if we know it
      if (action.payload.secret)
        yield transferSecret({ secret: action.payload.secret }, action.meta);
      yield transferSigned({ message: signed, fee }, action.meta);
      // messageSend LockedTransfer handled by transferSignedRetryMessageEpic
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
    assert(transfer.lock.expiration.gt(state.blockNumber), 'lock expired');
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
      secret: state.secrets[action.meta.secrethash].secret,
    };
    signed$ = from(signMessage(signer, message, { log }));
  }

  return signed$.pipe(
    withLatestFrom(state$),
    mergeMap(function*([signed, state]) {
      assert(transfer.lock.expiration.gt(state.blockNumber), 'lock expired!');
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
        : (undefined as any),
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

/**
 * Core logic of {@link transferSignedRetryMessageEpic }.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of RaidenStates
 * @param action - The {@link transferSigned} action
 * @returns - Observable of {@link messageSend.request} actions
 */
const transferSignedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferSigned,
): Observable<messageSend.request> => {
  const secrethash = action.meta.secrethash;
  const signed = action.payload.message;
  const send = messageSend.request(
    { message: signed },
    { address: signed.recipient, msgId: signed.message_identifier.toString() },
  );
  // emit request once immediatelly, then wait until success, then retry every 30s
  const processedOrNotPossibleToSend = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return (
      !!transfer.transferProcessed ||
      !!transfer.unlockProcessed ||
      !!transfer.lockExpiredProcessed ||
      !!transfer.channelClosed
    );
  };
  return retrySendUntil$(send, action$, state$, processedOrNotPossibleToSend);
};

/**
 * Handles a transferSigned action and retry messageSend.request until transfer is gone (completed
 * with success or error) OR Processed message for LockedTransfer received.
 * transferSigned for pending LockedTransfer's may be re-emitted on startup for pending transfer,
 * to start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferSigned actions
 * @param state$ - Observable of RaidenStates
 * @param latest$ - RaidenEpicDeps latest
 * @returns Observable of messageSend.request actions
 */
export const transferSignedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferSigned)),
    mergeMap(action =>
      transferSignedRetryMessage$(action$, latest$.pipe(pluckDistinct('state')), action),
    ),
  );

/**
 * Core logic of {@link transferUnlockedRetryMessageEpic}
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of the latest RaidenStates
 * @param action - the transferUnlock.success action
 * @param state - Contains the current state of the app
 * @returns Observable of {@link messageSend.request} actions
 */
const transferUnlockedRetryMessage$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferUnlock.success,
  state: RaidenState,
): Observable<messageSend.request> => {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
  const unlock = action.payload.message;
  const transfer = state.sent[secrethash].transfer[1];
  const send = messageSend.request(
    { message: unlock },
    { address: transfer.recipient, msgId: unlock.message_identifier.toString() },
  );

  // emit request once immediatelly, then wait until respective success, then repeats until confirmed
  const unlockProcessedOrChannelClosed = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return !!transfer.unlockProcessed || !!transfer.channelClosed;
  };

  return retrySendUntil$(send, action$, state$, unlockProcessedOrChannelClosed);
};

/**
 * Handles a transferUnlock.success action and retry messageSend until confirmed.
 * transferUnlock.success for pending Unlock's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @returns Observable of messageSend.request actions
 */
export const transferUnlockedRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferUnlock.success)),
    withLatestFrom(latest$.pipe(pluckDistinct('state'))),
    mergeMap(([action, state]) =>
      transferUnlockedRetryMessage$(action$, latest$.pipe(pluckDistinct('state')), action, state),
    ),
  );

/**
 * Core logic of {@link transferExpiredRetryMessageEpic}.
 *
 * @param action$ - Observable of transferUnlock.success actions
 * @param state$ - Observable of RaidenStates
 * @param action - transferExpire.success action
 * @param state - The current state of the app
 * @returns Observable of {@link messageSend.request} actions
 */
const expiredRetryMessages$ = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  action: transferExpire.success,
  state: RaidenState,
): Observable<messageSend.request> => {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return EMPTY; // shouldn't happen
  const lockExpired = action.payload.message;
  const send = messageSend.request(
    { message: lockExpired },
    {
      address: state.sent[secrethash].transfer[1].recipient,
      msgId: lockExpired.message_identifier.toString(),
    },
  );
  const lockExpiredProcessedOrChannelClosed = (state: RaidenState) => {
    const transfer = state.sent[secrethash];
    return !!transfer.lockExpiredProcessed || !!transfer.channelClosed;
  };
  // emit request once immediatelly, then wait until respective success, then retries until confirmed
  return retrySendUntil$(send, action$, state$, lockExpiredProcessedOrChannelClosed);
};

/**
 * Handles a transferExpire.success action and retry messageSend.request until transfer is gone (completed
 * with success or error).
 * transferExpire.success for pending LockExpired's may be re-emitted on startup for pending transfer, to
 * start retrying sending the message again until stop condition is met.
 *
 * @param action$ - Observable of transferExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param latest$ - RaidenEpicDeps latest
 * @returns Observable of messageSend.request actions
 */
export const transferExpiredRetryMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferExpire.success)),
    withLatestFrom(latest$.pipe(pluckDistinct('state'))),
    mergeMap(([action, state]) =>
      expiredRetryMessages$(action$, latest$.pipe(pluckDistinct('state')), action, state),
    ),
  );

/**
 * Contains the core logic of {@link transferAutoExpireEpic}.
 *
 * @param state - Contains The current state of the app
 * @param blockNumber - The current block number
 * @param action$ - Observable of {@link RaidenAction} actions
 * @returns Observable of {@link transferExpire.request} or {@link transfer.failure} actions
 */
function autoExpire$(
  state: RaidenState,
  blockNumber: number,
  action$: Observable<RaidenAction>,
): Observable<transferExpire.request | transfer.failure> {
  const requests$: Observable<transferExpire.request | transfer.failure>[] = [];

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
    const requestAndWait$ = dispatchAndWait$(
      action$,
      transferExpire.request(undefined, { secrethash }),
      isResponseOf(transferExpire, { secrethash }),
    );
    requests$.push(requestAndWait$);
    // notify users that this transfer failed definitely
    requests$.push(
      of(
        transfer.failure(
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
 * Process newBlocks, emits transferExpire.request (request to compose&sign LockExpired for a transfer)
 * if pending transfer's lock expired and transfer didn't unlock (succeed) in time
 * Also, emits transfer.failure, to notify users that a transfer has failed (although it'll only be
 * considered as completed with fail once the transferExpireProcessed arrives).
 *
 * @param action$ - Observable of newBlock|transferExpire.success|transferExpire.failure actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferExpire.request|transfer.failure actions
 */
export const transferAutoExpireEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferExpire.request | transfer.failure> =>
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
        return autoExpire$(state, blockNumber, action$);
      },
    ),
  );

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
): Observable<
  matrixPresence.request | transferSigned | transferUnlock.success | transferExpire.success
> =>
  state$.pipe(
    first(),
    mergeMap(function*(state) {
      // loop over all pending transfers
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash;
        // transfer already completed or channelClosed
        if (sent.unlockProcessed || sent.lockExpiredProcessed || sent.channelClosed) continue;
        // on init, request monitor presence of any pending transfer target
        yield matrixPresence.request(undefined, { address: sent.transfer[1].target });
        // Processed not received yet for LockedTransfer
        if (!sent.transferProcessed)
          yield transferSigned({ message: sent.transfer[1], fee: sent.fee }, { secrethash });
        // already unlocked, but Processed not received yet for Unlock
        if (sent.unlock) yield transferUnlock.success({ message: sent.unlock[1] }, { secrethash });
        // lock expired, but Processed not received yet for LockExpired
        if (sent.lockExpired)
          yield transferExpire.success({ message: sent.lockExpired[1] }, { secrethash });
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
): Observable<transferProcessed> =>
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
  { log }: RaidenEpicDeps,
): Observable<transferSecretRequest> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(SecretRequest).is(message)) return;
      // proceed only if we know the secret and the transfer
      if (!(message.secrethash in state.secrets) || !(message.secrethash in state.sent)) return;

      const transfer = state.sent[message.secrethash].transfer[1];
      const fee = state.sent[message.secrethash].fee;
      const value = transfer.lock.amount.sub(fee) as UInt<32>;
      if (
        transfer.target !== action.meta.address || // reveal only to target
        !transfer.payment_identifier.eq(message.payment_identifier)
      ) {
        log.warn('Invalid SecretRequest for transfer', message, transfer);
      } else if (
        !message.expiration.lte(transfer.lock.expiration) ||
        !message.expiration.gt(state.blockNumber)
      ) {
        log.warn('SecretRequest for expired transfer', message, transfer);
      } else if (!message.amount.gte(value)) {
        log.warn('SecretRequest for amount too small!', message, transfer);
      } /* accept request */ else {
        if (!message.amount.eq(value))
          log.warn('Accepted SecretRequest for amount different than sent', message, transfer);
        yield transferSecretRequest({ message }, { secrethash: message.secrethash });
      }
      // we don't check if transfer was refunded. If partner refunded the transfer but still
      // forwarded the payment, they would be in risk of losing their money, not us
    }),
  );

/**
 * Contains the core logic of {@link transferSecretRevealEpic}.
 *
 * @param state - Contains the current state of the app
 * @param action - The {@link transferSecretRequest} action that
 * @param signer - The singer that will sign the message
 * @returns Observable of {@link transferSecretReveal} and {@link messageSend.request} actions
 */
const secretReveal$ = (
  state: RaidenState,
  action: transferSecretRequest,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transferSecretReveal | messageSend.request> => {
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
    reveal$ = from(signMessage(signer, message, { log }));
  }

  return reveal$.pipe(
    mergeMap(function*(message) {
      yield transferSecretReveal({ message }, action.meta);
      yield messageSend.request(
        { message },
        { address: target, msgId: message.message_identifier.toString() },
      );
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
 * @param deps - RaidenEpicDeps
 * @param deps.signer - RaidenEpicDeps signer
 * @param deps.latest$ - RaidenEpicDeps latest$
 * @returns Observable of transferSecretReveal|messageSend.request actions
 */
export const transferSecretRevealEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<transferSecretReveal | messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferSecretRequest)),
    concatMap(action =>
      latest$.pipe(pluckDistinct('state')).pipe(
        first(),
        mergeMap(state => secretReveal$(state, action, { log, signer })),
      ),
    ),
  );

/**
 * Handles receiving a valid SecretReveal from recipient (neighbor/partner)
 * This indicates that the partner knowws the secret, and we should Unlock to avoid going on-chain.
 * The transferUnlock.request action is a request for the unlocking to be generated and sent.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
 */
export const transferSecretRevealedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferUnlock.request | transferSecret> =>
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
      yield transferUnlock.request(undefined, { secrethash });
    }),
  );

/**
 * Handles receiving a signed Processed for some sent Unlock
 * It sends the success action for transfer (which resolves any pending Promise), marking it as
 * completed successfuly by setting sent.unlockProcessed
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.success|transferUnlockProcessed actions
 */
export const transferUnlockProcessedReceivedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transfer.success | transferUnlockProcessed> =>
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
      yield transfer.success(
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
 * transfer.failure was already sent at newBlock handling/transferExpire.request time
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of output actions for this epic
 */
export const transferExpireProcessedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferExpireProcessed> =>
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
 * @param action$ - Observable of channelClose.{requet,success} actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.{success|failure} actions
 */
export const transferChannelClosedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transfer.success | transfer.failure> =>
  action$.pipe(
    filter(isActionOf([channelClose.request, channelClose.success])),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      for (const [key, sent] of Object.entries(state.sent)) {
        const secrethash = key as Hash;
        const sentTransfer = sent.transfer[1];
        if (
          sentTransfer.token_network_address !== action.meta.tokenNetwork ||
          sentTransfer.recipient !== action.meta.partner
        )
          continue;
        // as we can't know for sure if recipient/partner received the secret or unlock,
        //consider transfer failed iff neither the secret was revealed nor the unlock happened
        if (!sent.secretReveal && !sent.unlock)
          yield transfer.failure(new Error(`Channel closed before revealing or unlocking`), {
            secrethash,
          });
        else if (state.sent[secrethash].unlock)
          yield transfer.success(
            {
              balanceProof: getBalanceProofFromEnvelopeMessage(state.sent[secrethash].unlock![1]),
            },
            { secrethash },
          );
        else yield transfer.success({}, { secrethash });
      }
    }),
  );

/**
 * Receiving RefundTransfer for pending transfer fails it
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transfer.failure|transferRefunded actions
 */
export const transferRefundedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<transferRefunded | transfer.failure> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      if (!message || !Signed(RefundTransfer).is(message)) return;
      const secrethash = message.lock.secrethash;
      if (!(secrethash in state.sent)) return;
      const [, sent] = state.sent[secrethash].transfer;
      if (
        message.initiator !== sent.recipient ||
        !message.payment_identifier.eq(sent.payment_identifier) ||
        !message.lock.amount.eq(sent.lock.amount) ||
        !message.lock.expiration.eq(sent.lock.expiration) ||
        state.sent[secrethash].unlock || // already unlocked
        state.sent[secrethash].lockExpired || // already expired
        state.sent[secrethash].channelClosed || // channel closed
        message.lock.expiration.lte(state.blockNumber) // lock expired but transfer didn't yet
      )
        return;
      yield transferRefunded({ message }, { secrethash });
      yield transfer.failure(new Error('transfer refunded'), { secrethash });
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
 * @returns Observable of messageSend.request actions
 */
export const transferReceivedReplyProcessedEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer }: RaidenEpicDeps,
): Observable<messageSend.request> => {
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
      // defer causes the cache check to be performed at subscription time
      return defer(() => {
        const msgId = message.message_identifier;
        const key = msgId.toString();
        const cached = cache.get(key);
        if (cached)
          return of(
            messageSend.request({ message: cached }, { address: action.meta.address, msgId: key }),
          );

        const processed: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: msgId,
        };
        return from(signMessage(signer, processed, { log })).pipe(
          tap(signed => cache.put(key, signed)),
          map(signed =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};

/**
 * When receiving a [[WithdrawRequest]] message, create the respective [[withdrawReceive.request]]
 * action
 *
 * @param action$ - Observable of messageReceived actions
 * @returns Observable of withdrawReceive.request actions
 */
export const withdrawRequestReceivedEpic = (
  action$: Observable<RaidenAction>,
): Observable<withdrawReceive.request> =>
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
      yield withdrawReceive.request(
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
 * sendMessage when a [[withdrawReceive.success]] action is fired
 *
 * @param action$ - Observable of withdrawReceive.success actions
 * @returns Observable of messageSend.request actions
 */
export const withdrawSendConfirmationEpic = (
  action$: Observable<RaidenAction>,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(isActionOf(withdrawReceive.success)),
    map(action =>
      messageSend.request(
        { message: action.payload.message },
        {
          address: action.meta.partner,
          msgId: action.payload.message.message_identifier.toString(),
        },
      ),
    ),
  );
