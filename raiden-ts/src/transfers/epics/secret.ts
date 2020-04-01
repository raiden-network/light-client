import { Event } from 'ethers/contract';
import { EMPTY, from, Observable, of } from 'rxjs';
import {
  concatMap,
  filter,
  first,
  map,
  mergeMap,
  withLatestFrom,
  catchError,
  distinct,
  pluck,
  exhaustMap,
  takeUntil,
  ignoreElements,
} from 'rxjs/operators';

import { newBlock } from '../../channels/actions';
import { assertTx } from '../../channels/utils';
import { RaidenAction } from '../../actions';
import { messageSend } from '../../messages/actions';
import { MessageType, SecretRequest, SecretReveal } from '../../messages/types';
import { signMessage, isMessageReceivedOfType } from '../../messages/utils';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { isActionOf, isConfirmationResponseOf } from '../../utils/actions';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { getEventsStream } from '../../utils/ethers';
import { pluckDistinct } from '../../utils/rx';
import { Hash, Secret, Signed, UInt } from '../../utils/types';
import {
  transfer,
  transferSecret,
  transferSecretRegister,
  transferSecretRequest,
  transferSecretReveal,
  transferUnlock,
} from '../actions';
import { getSecrethash, makeMessageId } from '../utils';
import { Direction } from '../state';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import { Capabilities } from '../../constants';
import { dispatchAndWait$ } from './utils';

/**
 * Handles receiving a signed SecretRequest from target for some sent LockedTransfer
 * Emits a transferSecretRequest action only if all conditions are met
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSecretRequest actions
 */
export const transferSecretRequestedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, log }: RaidenEpicDeps,
): Observable<transferSecretRequest> =>
  action$.pipe(
    filter(isMessageReceivedOfType(Signed(SecretRequest))),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      // proceed only if we know the secret and the SENT transfer
      if (!(message.secrethash in state.sent)) return;

      const transfer = state.sent[message.secrethash].transfer[1];
      // we do only some basic verification here, as most of it is done upon SecretReveal,
      // to persist the request in most cases in TransferState.secretRequest
      if (
        transfer.initiator !== address || // only the initiator may reply a SecretRequest
        transfer.target !== action.meta.address || // reveal only to target
        !transfer.payment_identifier.eq(message.payment_identifier)
      ) {
        log.warn('Invalid SecretRequest for transfer', message, transfer);
        return;
      }
      yield transferSecretRequest(
        { message },
        { secrethash: message.secrethash, direction: Direction.SENT },
      );
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
 * @returns Observable of {@link transfer.failure}, {@link transferSecretReveal} or
 *      {@link messageSend.request} actions
 */
const secretReveal$ = (
  state: RaidenState,
  action: transferSecretRequest,
  { signer, log }: Pick<RaidenEpicDeps, 'signer' | 'log'>,
): Observable<transfer.failure | transferSecretReveal | messageSend.request> => {
  const request = action.payload.message;
  const secrethash = action.meta.secrethash;
  if (!state.sent[secrethash]?.secret) {
    // shouldn't happen, as we're the initiator (for now), and always know the secret
    log.warn('SecretRequest for unknown secret', request, secrethash);
    return EMPTY;
  }

  const transf = state.sent[secrethash].transfer[1];
  const target = transf.target;
  const fee = state.sent[secrethash].fee;
  const value = transf.lock.amount.sub(fee) as UInt<32>;

  if (
    !request.expiration.lte(transf.lock.expiration) ||
    !request.expiration.gt(state.blockNumber)
  ) {
    log.error('SecretRequest for expired transfer', request, transf);
    return EMPTY;
  } else if (request.amount.lt(value)) {
    log.error('SecretRequest for amount too small!', request, transf);
    return of(
      transfer.failure(new RaidenError(ErrorCodes.XFER_INVALID_SECRETREQUEST), action.meta),
    );
  } else if (!request.amount.eq(value)) {
    // accept request
    log.info('Accepted SecretRequest for amount different than sent', request, transf);
  }

  let reveal$: Observable<Signed<SecretReveal>>;
  if (state.sent[action.meta.secrethash].secretReveal)
    reveal$ = of(state.sent[action.meta.secrethash].secretReveal![1]);
  else {
    const message: SecretReveal = {
      type: MessageType.SECRET_REVEAL,
      // eslint-disable-next-line @typescript-eslint/camelcase
      message_identifier: makeMessageId(),
      secret: state.sent[action.meta.secrethash].secret![1].value,
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
 * transfer.failure is emitted in case invalid secretRequest comes, as no valid one will come as
 * per current implementation, so we fail early to notify users about it.
 *
 * @param action$ - Observable of transferSecretRequest actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @param deps.signer - RaidenEpicDeps signer
 * @param deps.latest$ - RaidenEpicDeps latest$
 * @returns Observable of transfer.failure|transferSecretReveal|messageSend.request actions
 */
export const transferSecretRevealEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<transfer.failure | transferSecretReveal | messageSend.request> =>
  action$.pipe(
    filter(isActionOf(transferSecretRequest)),
    filter(action => action.meta.direction === Direction.SENT),
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
    // we don't require Signed SecretReveal, nor even check sender for persisting the secret
    filter(isMessageReceivedOfType(SecretReveal)),
    withLatestFrom(state$),
    mergeMap(function*([action, state]) {
      const message = action.payload.message;
      const secrethash = getSecrethash(message.secret);

      if (secrethash in state.sent) {
        const meta = { secrethash, direction: Direction.SENT };
        // if secrethash matches, we're good for persisting
        yield transferSecret({ secret: message.secret }, meta);

        // but are stricter for unlocking to next hop
        if (
          action.meta.address === state.sent[secrethash].partner &&
          // don't unlock if channel closed
          !state.sent[secrethash].channelClosed &&
          // don't unlock again if already unlocked, retry handled by transferRetryMessageEpic
          // in the future, we may avoid retry until Processed, and [re]send once per SecretReveal
          !state.sent[secrethash].unlock
          // accepts secretReveal/unlock request even if registered on-chain
        ) {
          // request unlock to be composed, signed & sent to partner
          yield transferUnlock.request(undefined, meta);
        }
      }

      // we're mediator or target, and received reveal from next hop or initiator, respectively
      if (secrethash in state.received) {
        // if secrethash matches, we're good for persisting, which also triggers Reveal back
        yield transferSecret(
          { secret: message.secret },
          { secrethash, direction: Direction.RECEIVED },
        );
      }
    }),
  );

/**
 * For a received transfer, when we know the secret, sign & send a SecretReveal to previous hop
 *
 * @param action$ - Observable of transferSecret|transferSecretReveal actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @returns Observable of transferSecretReveal actions
 */
export const transferRequestUnlockEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<transferSecretReveal> =>
  action$.pipe(
    filter(isActionOf([transferSecret, transferSecretRegister.success])),
    filter(action => action.meta.direction === Direction.RECEIVED),
    concatMap(action =>
      latest$.pipe(
        pluckDistinct('state'),
        first(),
        filter(({ received }) => !received[action.meta.secrethash]?.secretReveal),
        mergeMap(() => {
          const message: SecretReveal = {
            type: MessageType.SECRET_REVEAL,
            // eslint-disable-next-line @typescript-eslint/camelcase
            message_identifier: makeMessageId(),
            secret: action.payload.secret,
          };
          return signMessage(signer, message, { log });
        }),
        map(message => transferSecretReveal({ message }, action.meta)),
        catchError(err => {
          log.warn('Error trying to sign SecretReveal - ignoring', err, action.meta);
          return EMPTY;
        }),
      ),
    ),
  );

/**
 * Monitors SecretRegistry and emits when a relevant secret gets registered
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSecretRegister.success actions
 */
export const monitorSecretRegistryEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { secretRegistryContract }: RaidenEpicDeps,
): Observable<transferSecretRegister.success> =>
  getEventsStream<[Hash, Secret, Event]>(secretRegistryContract, [
    secretRegistryContract.filters.SecretRevealed(null, null),
  ]).pipe(
    withLatestFrom(state$),
    filter(
      ([[secrethash, , { blockNumber }], { sent, received }]) =>
        // emits only if lock didn't expire yet
        (secrethash in sent && sent[secrethash].transfer[1].lock.expiration.gte(blockNumber!)) ||
        (secrethash in received &&
          received[secrethash].transfer[1].lock.expiration.gte(blockNumber!)),
    ),
    mergeMap(function*([[secrethash, secret, event], { sent, received }]) {
      if (
        secrethash in sent &&
        sent[secrethash].transfer[1].lock.expiration.gte(event.blockNumber!)
      ) {
        yield transferSecretRegister.success(
          {
            secret,
            txHash: event.transactionHash! as Hash,
            txBlock: event.blockNumber!,
            confirmed: undefined,
          },
          { secrethash, direction: Direction.SENT },
        );
      }
      if (
        secrethash in received &&
        received[secrethash].transfer[1].lock.expiration.gte(event.blockNumber!)
      ) {
        yield transferSecretRegister.success(
          {
            secret,
            txHash: event.transactionHash! as Hash,
            txBlock: event.blockNumber!,
            confirmed: undefined,
          },
          { secrethash, direction: Direction.RECEIVED },
        );
      }
    }),
  );

/**
 * A simple epic to emit transfer.success when secret register is confirmed
 *
 * @param action$ - Observable of transferSecretRegister.success actions
 * @returns Observable of transfer.success actions
 */
export const transferSuccessOnSecretRegisteredEpic = (
  action$: Observable<RaidenAction>,
): Observable<transfer.success> =>
  action$.pipe(
    filter(transferSecretRegister.success.is),
    filter(action => !!action.payload.confirmed),
    map(action => transfer.success({}, action.meta)),
  );

/**
 * Process newBlocks and pending received transfers. If we know the secret, and transfer doesn't
 * get unlocked before revealTimeout blocks are left to lock expiration, request to register secret
 * TODO: check economic viability (and define what that means) of registering lock on-chain
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of transferSecretRegister.request actions
 */
export const transferAutoRegisterEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, latest$ }: RaidenEpicDeps,
): Observable<transferSecretRegister.request> =>
  state$.pipe(
    pluckDistinct(Direction.RECEIVED),
    mergeMap(received => from(Object.keys(received) as Hash[])),
    distinct(),
    mergeMap(secrethash =>
      action$.pipe(
        filter(newBlock.is),
        withLatestFrom(latest$.pipe(pluck('state', Direction.RECEIVED, secrethash)), config$),
        filter(
          ([action, received, { caps, revealTimeout }]) =>
            !caps?.[Capabilities.NO_RECEIVE] && // ignore if receiving is disabled
            !!received.secret && // register only if we know the secret
            received.transfer[1].lock.expiration
              .sub(revealTimeout)
              .lt(action.payload.blockNumber) && // and after <revealTimeout left to expiration
            !received.secret?.[1]?.registerBlock && // and not yet registered nor unlocked
            !received.unlock,
        ),
        exhaustMap(([, received]) => {
          const meta = { secrethash, direction: Direction.RECEIVED };
          return dispatchAndWait$(
            action$,
            transferSecretRegister.request({ secret: received.secret![1].value }, meta),
            isConfirmationResponseOf(transferSecretRegister, meta),
          );
        }),
        takeUntil(
          latest$.pipe(
            pluckDistinct('state'),
            filter(state => {
              const blockNumber = state.blockNumber;
              const received = state.received[secrethash];
              const expiration = received.transfer[1].lock.expiration;
              return !!(
                expiration.lt(blockNumber) || // give up if lock already expired
                received.unlock ||
                // stop if secret got registered or unlocked
                received.secret?.[1]?.registerBlock
              );
              // even if channelClosed, while inside lock expiration, continue to try to register
            }),
          ),
        ),
      ),
    ),
  );

/**
 * Registers secret on-chain. Success is detected by monitorSecretRegistryEpic
 *
 * @param action$ - Observable of transferSecretRegister.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Dependencies
 * @returns Observable of transferSecretRegister.failure actions
 */
export const transferSecretRegisterEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, address, main, secretRegistryContract, config$ }: RaidenEpicDeps,
): Observable<transferSecretRegister.failure> =>
  action$.pipe(
    filter(transferSecretRegister.request.is),
    withLatestFrom(config$),
    mergeMap(([action, { subkey: configSubkey }]) => {
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const contract = getContractWithSigner(secretRegistryContract, onchainSigner);

      return from(contract.functions.registerSecret(action.payload.secret)).pipe(
        assertTx('registerSecret', ErrorCodes.XFER_REGISTERSECRET_TX_FAILED, { log }),
        // transferSecretRegister.success handled by monitorSecretRegistryEpic
        ignoreElements(),
        catchError(err => of(transferSecretRegister.failure(err, action.meta))),
      );
    }),
  );
