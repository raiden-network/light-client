import type { Observable } from 'rxjs';
import { AsyncSubject, EMPTY, from, of } from 'rxjs';
import {
  catchError,
  concatMap,
  endWith,
  exhaustMap,
  filter,
  first,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  pluck,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { transact } from '../../channels/utils';
import { intervalFromConfig } from '../../config';
import { Capabilities } from '../../constants';
import { messageSend } from '../../messages/actions';
import { MessageType, SecretRequest, SecretReveal } from '../../messages/types';
import { isMessageReceivedOfType, signMessage } from '../../messages/utils';
import type { RaidenState } from '../../state';
import { getCap } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf, isConfirmationResponseOf } from '../../utils/actions';
import { assert, commonTxErrors, ErrorCodes } from '../../utils/error';
import { fromEthersEvent, logToContractEvent } from '../../utils/ethers';
import { completeWith, pluckDistinct, retryWhile, takeIf, withMergeFrom } from '../../utils/rx';
import type { Hash, Secret, UInt } from '../../utils/types';
import { isntNil, Signed, untime } from '../../utils/types';
import {
  transfer,
  transferSecret,
  transferSecretRegister,
  transferSecretRequest,
  transferSecretReveal,
  transferUnlock,
} from '../actions';
import { Direction } from '../state';
import { getSecrethash, makeMessageId, searchValidViaAddress, transferKey } from '../utils';
import { dispatchAndWait$ } from './utils';

/**
 * Handles receiving a signed SecretRequest from target for some sent LockedTransfer
 * Emits a transferSecretRequest action only if all conditions are met
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @returns Observable of transferSecretRequest actions
 */
export function transferSecretRequestedEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, log }: RaidenEpicDeps,
): Observable<transferSecretRequest> {
  return action$.pipe(
    filter(isMessageReceivedOfType(Signed(SecretRequest))),
    withLatestFrom(state$),
    mergeMap(function* ([action, state]) {
      const message = action.payload.message;
      // proceed only if we know the secret and the SENT transfer
      const key = transferKey({ secrethash: message.secrethash, direction: Direction.SENT });
      const transferState = state.transfers[key];
      if (!transferState) return;

      const locked = transferState.transfer;
      // we do only some basic verification here, as most of it is done upon SecretReveal,
      // to persist the request in most cases in TransferState.secretRequest
      if (
        locked.initiator !== address || // only the initiator may reply a SecretRequest
        locked.target !== action.meta.address || // reveal only to target
        !locked.payment_identifier.eq(message.payment_identifier)
      ) {
        log.warn('Invalid SecretRequest for transfer', message, locked);
        return;
      }
      yield transferSecretRequest(
        { message, userId: action.payload.userId },
        { secrethash: message.secrethash, direction: Direction.SENT },
      );
    }),
  );
}

/**
 * Contains the core logic of {@link transferSecretRevealEpic}.
 *
 * @param action - The {@link transferSecretRequest} action that
 * @param deps - Epics dependencies
 * @param deps.signer - Signer instance
 * @param deps.log - Logger instance
 * @param deps.latest$ - Latest observable
 * @returns Observable of {@link transfer.failure}, {@link transferSecretReveal} or
 * {@link messageSend.request} actions
 */
const secretReveal$ = (
  action: transferSecretRequest,
  { signer, log, latest$ }: Pick<RaidenEpicDeps, 'signer' | 'log' | 'latest$'>,
): Observable<transfer.failure | transferSecretReveal | messageSend.request> => {
  const request = action.payload.message;
  return latest$.pipe(
    first(),
    mergeMap(({ state }) => {
      const transferState = state.transfers[transferKey(action.meta)];
      // shouldn't happen, as we're the initiator (for now), and always know the secret
      assert(transferState?.secret, ['SecretRequest for unknown secret', request]);

      const locked = transferState.transfer;
      const target = locked.target;
      const fee = transferState.fee;
      const value = locked.lock.amount.sub(fee) as UInt<32>;

      assert(
        request.expiration.lte(locked.lock.expiration) &&
          request.expiration.gt(Math.floor(Date.now() / 1e3)),
        ['SecretRequest for expired transfer', { request, lock: locked.lock }],
      );
      assert(request.amount.gte(value), [
        'SecretRequest for amount too small!',
        { request, value },
      ]);

      if (!request.amount.eq(value)) {
        // accept request
        log.info('Accepted SecretRequest for amount greater than sent', request, locked);
      }

      let reveal$: Observable<Signed<SecretReveal>>;
      if (transferState.secretReveal) reveal$ = of(transferState.secretReveal);
      else {
        const message: SecretReveal = {
          type: MessageType.SECRET_REVEAL,
          message_identifier: makeMessageId(),
          secret: transferState.secret,
        };
        reveal$ = from(signMessage(signer, message, { log }));
      }

      return reveal$.pipe(
        mergeMap(function* (message) {
          yield transferSecretReveal({ message }, action.meta);
          yield messageSend.request(
            { message, userId: action.payload.userId },
            { address: target, msgId: message.message_identifier.toString() },
          );
        }),
      );
    }),
    catchError((err) => of(transfer.failure(err, action.meta))),
  );
};

/**
 * Handles a transferSecretRequest action to send the respective secret to target
 * It both emits transferSecretReveal (to persist sent SecretReveal in state and indicate that
 * the secret was revealed and thus the transfer should be assumed as succeeded) as well as
 * triggers sending the message once. New SecretRequests will cause a new transferSecretRequest,
 * which will re-send the cached SecretReveal.
 * transfer.failure is emitted in case invalid secretRequest comes, as no valid one will come as
 * per current implementation, so we fail early to notify users about it.
 *
 * @param action$ - Observable of transferSecretRequest actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @param deps.signer - Signer instance
 * @param deps.latest$ - Latest observable
 * @param deps.log - Logger instance
 * @returns Observable of transfer.failure|transferSecretReveal|messageSend.request actions
 */
export function transferSecretRevealEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<transfer.failure | transferSecretReveal | messageSend.request> {
  return action$.pipe(
    filter(isActionOf(transferSecretRequest)),
    filter((action) => action.meta.direction === Direction.SENT),
    concatMap((action) => secretReveal$(action, deps)),
  );
}

/**
 * Handles receiving a valid SecretReveal from recipient (neighbor/partner)
 * This indicates that the partner knowws the secret, and we should Unlock to avoid going on-chain.
 * The transferUnlock.request action is a request for the unlocking to be generated and sent.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of output actions for this epic
 */
export function transferSecretRevealedEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<transferUnlock.request | transferSecret> {
  return action$.pipe(
    // we don't require Signed SecretReveal, nor even check sender for persisting the secret
    filter(isMessageReceivedOfType(SecretReveal)),
    withLatestFrom(state$, config$),
    mergeMap(function* ([action, state, { caps }]) {
      const secrethash = getSecrethash(action.payload.message.secret);
      const results = Object.values(Direction)
        .map((direction) => state.transfers[transferKey({ secrethash, direction })])
        .filter(isntNil);
      const message = action.payload.message;
      for (const sent of results.filter((doc) => doc.direction === Direction.SENT)) {
        const meta = { secrethash, direction: Direction.SENT };
        // if secrethash matches, we're good for persisting, don't care for sender/signature
        yield transferSecret({ secret: message.secret }, meta);

        // but are stricter for unlocking to next hop only
        if (
          action.meta.address === sent.partner &&
          // don't unlock if channel closed: balanceProofs already registered on-chain
          !sent.channelClosed
          // accepts secretReveal/unlock request even if registered on-chain
        ) {
          let viaPayload: transferUnlock.request['payload'];
          // unlock _through_ sender iff message is signed
          if ('signature' in message) viaPayload = { userId: action.payload.userId };
          // request unlock to be composed, signed & sent to partner
          yield transferUnlock.request(viaPayload, meta);
        }
      }
      // avoid unlocking received transfers if receiving is disabled
      if (!getCap(caps, Capabilities.RECEIVE)) return;

      // we're mediator or target, and received reveal from next hop or initiator, respectively
      for (const _received of results.filter((doc) => doc.direction === Direction.RECEIVED)) {
        // if secrethash matches, we're good for persisting, which also triggers Reveal back
        yield transferSecret(
          { secret: message.secret },
          { secrethash, direction: Direction.RECEIVED },
        );
      }
    }),
  );
}

/**
 * For a received transfer, when we know the secret, sign & send a SecretReveal to previous hop
 *
 * @param action$ - Observable of transferSecret|transferSecretReveal actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.latest$ - Latest observable
 * @returns Observable of transferSecretReveal actions
 */
export function transferRequestUnlockEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<transferSecretReveal> {
  return action$.pipe(
    filter(isActionOf([transferSecret, transferSecretRegister.success])),
    filter((action) => action.meta.direction === Direction.RECEIVED),
    filter((action) => transferSecret.is(action) || !!action.payload.confirmed),
    concatMap((action) =>
      latest$.pipe(
        pluckDistinct('state'),
        first(),
        filter(({ transfers }) => transferKey(action.meta) in transfers),
        mergeMap(({ transfers }) => {
          const transferState = transfers[transferKey(action.meta)]!;
          const cached = transferState.secretReveal;
          let signed$;
          if (cached) {
            signed$ = of(untime(cached));
          } else {
            const message: SecretReveal = {
              type: MessageType.SECRET_REVEAL,
              message_identifier: makeMessageId(),
              secret: action.payload.secret,
            };
            signed$ = from(signMessage(signer, message, { log }));
          }
          const via = searchValidViaAddress(
            transferState.transfer.metadata,
            transferState.partner,
          );
          return signed$.pipe(
            map((message) => transferSecretReveal({ message, ...via }, action.meta)),
          );
        }),
        catchError((err) => {
          log.warn('Error trying to sign SecretReveal - ignoring', err, action.meta);
          return EMPTY;
        }),
      ),
    ),
  );
}

/**
 * Monitors SecretRegistry and emits when a relevant secret gets registered
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.provider - Provider instance
 * @param deps.secretRegistryContract - SecretRegistry contract instance
 * @param deps.config$ - Config observable
 * @param deps.init$ - Init$ tasks subject
 * @param deps.getBlockTimestamp - block timestamp getter function
 * @returns Observable of transferSecretRegister.success actions
 */
export function monitorSecretRegistryEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { provider, secretRegistryContract, config$, init$, getBlockTimestamp }: RaidenEpicDeps,
): Observable<transferSecretRegister.success> {
  const initSub = new AsyncSubject<null>();
  init$.next(initSub);
  return fromEthersEvent(provider, secretRegistryContract.filters.SecretRevealed(null, null), {
    confirmations: config$.pipe(pluck('confirmationBlocks')),
    blockNumber$: state$.pipe(pluckDistinct('blockNumber')),
    onPastCompleted: () => {
      initSub.next(null);
      initSub.complete();
    },
  }).pipe(
    completeWith(state$),
    map(logToContractEvent(secretRegistryContract)),
    withMergeFrom(([, , event]) => getBlockTimestamp(event.blockNumber)),
    withLatestFrom(state$, config$),
    mergeMap(function* ([
      [[secrethash, secret, event], txTimestamp],
      { transfers, blockNumber },
      { confirmationBlocks },
    ]) {
      // find sent|received transfers matching secrethash and secret registered before expiration
      for (const direction of Object.values(Direction)) {
        const key = transferKey({ secrethash: secrethash as Hash, direction });
        const transferState = transfers[key];
        if (!transferState) continue;
        yield transferSecretRegister.success(
          {
            secret: secret as Secret,
            txTimestamp,
            txHash: event.transactionHash! as Hash,
            txBlock: event.blockNumber,
            confirmed:
              event.blockNumber + confirmationBlocks <= blockNumber ? !event.removed : undefined,
          },
          { secrethash: secrethash as Hash, direction },
        );
      }
    }),
  );
}

/**
 * A simple epic to emit transfer.success when secret register is confirmed
 *
 * @param action$ - Observable of transferSecretRegister.success actions
 * @returns Observable of transfer.success actions
 */
export function transferSuccessOnSecretRegisteredEpic(
  action$: Observable<RaidenAction>,
): Observable<transfer.success> {
  return action$.pipe(
    filter(transferSecretRegister.success.is),
    filter((action) => !!action.payload.confirmed),
    map((action) => transfer.success({}, action.meta)),
  );
}

/**
 * Process newBlocks and pending received transfers. If we know the secret, and transfer doesn't
 * get unlocked before revealTimeout seconds are left to lock expiration, request to register secret
 * TODO: check economic viability (and define what that means) of registering lock on-chain
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of transferSecretRegister.request actions
 */
export function transferAutoRegisterEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, latest$ }: RaidenEpicDeps,
): Observable<transferSecretRegister.request> {
  return state$.pipe(
    withLatestFrom(config$),
    mergeMap(([{ transfers }, { revealTimeout }]) =>
      Object.values(transfers).filter((r) => {
        const now = Math.round(Date.now() / 1e3); // now() in seconds
        return (
          r.direction === Direction.RECEIVED &&
          !r.unlock && // not unlocked
          !r.expired && // not expired
          !!r.secret && // secret exists and isn't registered yet
          !r.secretRegistered &&
          // transfers which are inside the danger zone (revealTimeout before expiration)
          now < r.expiration &&
          r.expiration <= now + revealTimeout
        );
      }),
    ),
    // emit each result every block
    // group results by transferKey, so we don't overlap requests for the same transfer
    groupBy((transferState) => transferState._id, {
      // durationSelector: should emit when we want to dispose of the grouped$ subject
      duration: (grouped$) =>
        latest$.pipe(
          pluck('state'),
          filter(({ transfers }) => {
            const transferState = transfers[grouped$.key];
            return (
              !transferState ||
              transferState.expiration < Date.now() / 1e3 ||
              !!transferState.unlock ||
              !!transferState.secretRegistered
            );
          }),
        ),
    }),
    mergeMap((grouped$) =>
      grouped$.pipe(
        exhaustMap((transferState) => {
          const meta = { secrethash: transferState.secrethash, direction: Direction.RECEIVED };
          // "hold" this (per transfer) exhaustMap until getting a response for the request
          return dispatchAndWait$(
            action$,
            transferSecretRegister.request({ secret: transferState.secret! }, meta),
            isConfirmationResponseOf(transferSecretRegister, meta),
          );
        }),
        // if grouped$ completes (e.g. because of durationSelector), give up on dispatchAndWait$
        takeUntil(grouped$.pipe(ignoreElements(), endWith(1))),
      ),
    ),
    takeIf(
      config$.pipe(
        pluck('caps'),
        map((caps) => getCap(caps, Capabilities.RECEIVE)),
        completeWith(action$),
      ),
    ),
  );
}

/**
 * Registers secret on-chain. Success is detected by monitorSecretRegistryEpic
 *
 * @param action$ - Observable of transferSecretRegister.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns Observable of transferSecretRegister.failure actions
 */
export function transferSecretRegisterEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<transferSecretRegister.failure> {
  const { log, secretRegistryContract, config$ } = deps;
  return action$.pipe(
    filter(transferSecretRegister.request.is),
    mergeMap((action) =>
      transact(secretRegistryContract, 'registerSecret', [action.payload.secret], deps, {
        error: ErrorCodes.XFER_REGISTERSECRET_TX_FAILED,
      }).pipe(
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
        // transferSecretRegister.success handled by monitorSecretRegistryEpic
        ignoreElements(),
        catchError((err) => of(transferSecretRegister.failure(err, action.meta))),
      ),
    ),
  );
}
