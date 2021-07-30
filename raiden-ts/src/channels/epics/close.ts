import { concat as concatBytes } from '@ethersproject/bytes';
import { Zero } from '@ethersproject/constants';
import type { Observable } from 'rxjs';
import { defer, EMPTY, from, of } from 'rxjs';
import {
  catchError,
  delayWhen,
  filter,
  ignoreElements,
  mergeMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import { createBalanceHash, MessageTypeId } from '../../messages/utils';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { encode } from '../../utils/data';
import { commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { retryWhile } from '../../utils/rx';
import type { Signature } from '../../utils/types';
import { channelClose, newBlock } from '../actions';
import { ChannelState } from '../state';
import { assertTx, channelKey } from '../utils';

/**
 * A ChannelClose action requested by user
 * Needs to be called on an opened or closing (for retries) channel.
 * If tx goes through successfuly, stop as ChannelClosed success action will instead be detected
 * and reacted by channelEventsEpic.
 * If anything detectable goes wrong, fires a ChannelCloseActionFailed instead
 *
 * @param action$ - Observable of channelClose actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.network - Current network
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of channelClose.failure actions
 */
export function channelCloseEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    provider,
    network,
    getTokenNetworkContract,
    config$,
    latest$,
  }: RaidenEpicDeps,
): Observable<channelClose.failure> {
  return action$.pipe(
    filter(isActionOf(channelClose.request)),
    withLatestFrom(state$, config$, latest$),
    mergeMap(([action, state, { subkey: configSubkey }, { gasPrice }]) => {
      const { tokenNetwork, partner } = action.meta;
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload?.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      const channel = state.channels[channelKey(action.meta)];
      if (channel?.state !== ChannelState.open && channel?.state !== ChannelState.closing) {
        const error = new RaidenError(
          ErrorCodes.CNL_NO_OPEN_OR_CLOSING_CHANNEL_FOUND,
          action.meta,
        );
        return of(channelClose.failure(error, action.meta));
      }

      const balanceProof = channel.partner.balanceProof;
      const balanceHash = createBalanceHash(balanceProof);
      const nonce = balanceProof.nonce;
      const additionalHash = balanceProof.additionalHash;
      const nonClosingSignature = balanceProof.signature;

      const closingMessage = concatBytes([
        encode(tokenNetwork, 20),
        encode(network.chainId, 32),
        encode(MessageTypeId.BALANCE_PROOF, 32),
        encode(channel.id, 32),
        encode(balanceHash, 32),
        encode(nonce, 32),
        encode(additionalHash, 32),
        encode(nonClosingSignature, 65), // partner's signature for this balance proof
      ]); // UInt8Array of 277 bytes

      // sign counter balance proof, then send closeChannel transaction with our signature
      return from(signer.signMessage(closingMessage) as Promise<Signature>).pipe(
        mergeMap((closingSignature) =>
          defer(() =>
            tokenNetworkContract.closeChannel(
              channel.id,
              partner,
              address,
              balanceHash,
              nonce,
              additionalHash,
              nonClosingSignature,
              closingSignature,
              { gasPrice },
            ),
          ).pipe(
            assertTx('closeChannel', ErrorCodes.CNL_CLOSECHANNEL_FAILED, { log, provider }),
            retryWhile(intervalFromConfig(config$), {
              onErrors: commonAndFailTxErrors,
              log: log.info,
            }),
            // if channel gets closed while retrying (e.g. by partner), give up
            takeUntil(
              action$.pipe(
                filter(channelClose.success.is),
                filter(
                  (action) =>
                    action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
                ),
              ),
            ),
          ),
        ),
        // if succeeded, return a empty/completed observable
        // actual ChannelClosedAction will be detected and handled by channelEventsEpic
        // if any error happened on tx call/pipeline, catchError will then emit the
        // channelClose.failure action instead
        ignoreElements(),
        catchError((error) => of(channelClose.failure(error, action.meta))),
      );
    }),
  );
}

/**
 * When detecting a ChannelClosed event, calls updateNonClosingBalanceProof with partner's balance
 * proof, iff there's any
 * TODO: do it only if economically viable (and define what that means)
 *
 * @param action$ - Observable of channelClose.success|newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.network - Current network
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Empty observable
 */
export function channelUpdateEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    provider,
    network,
    getTokenNetworkContract,
    config$,
    latest$,
  }: RaidenEpicDeps,
): Observable<never> {
  return action$.pipe(
    filter(isActionOf(channelClose.success)),
    filter((action) => !!action.payload.confirmed),
    // wait a newBlock go through after channelClose confirmation, to ensure any pending
    // channelSettle could have been processed
    delayWhen(() => action$.pipe(filter(newBlock.is))),
    withLatestFrom(state$, config$, latest$),
    filter(([action, state]) => {
      const channel = state.channels[channelKey(action.meta)];
      return (
        channel?.state === ChannelState.closed &&
        channel.id === action.payload.id &&
        channel.partner.balanceProof.transferredAmount
          .add(channel.partner.balanceProof.lockedAmount)
          .gt(Zero) && // there's partners balanceProof (i.e. received transfers)
        channel.closeParticipant !== address // we're not the closing end
      );
    }),
    mergeMap(([action, state, { subkey }, { gasPrice }]) => {
      const { tokenNetwork, partner } = action.meta;
      const { signer: onchainSigner } = chooseOnchainAccount({ signer, address, main }, subkey);
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      const channel = state.channels[channelKey(action.meta)];

      const balanceHash = createBalanceHash(channel.partner.balanceProof);
      const nonce = channel.partner.balanceProof.nonce;
      const additionalHash = channel.partner.balanceProof.additionalHash;
      const closingSignature = channel.partner.balanceProof.signature;

      const nonClosingMessage = concatBytes([
        encode(tokenNetwork, 20),
        encode(network.chainId, 32),
        encode(MessageTypeId.BALANCE_PROOF_UPDATE, 32),
        encode(channel.id, 32),
        encode(balanceHash, 32),
        encode(nonce, 32),
        encode(additionalHash, 32),
        encode(closingSignature, 65), // partner's signature for this balance proof
      ]); // UInt8Array of 277 bytes

      // send updateNonClosingBalanceProof transaction
      return from(signer.signMessage(nonClosingMessage) as Promise<Signature>).pipe(
        mergeMap((nonClosingSignature) =>
          defer(() =>
            tokenNetworkContract.updateNonClosingBalanceProof(
              channel.id,
              partner,
              address,
              balanceHash,
              nonce,
              additionalHash,
              closingSignature,
              nonClosingSignature,
              { gasPrice },
            ),
          ).pipe(
            assertTx('updateNonClosingBalanceProof', ErrorCodes.CNL_UPDATE_NONCLOSING_BP_FAILED, {
              log,
              provider,
            }),
            retryWhile(intervalFromConfig(config$), {
              onErrors: commonAndFailTxErrors,
              log: log.info,
            }),
          ),
        ),
        // if succeeded, return a empty/completed observable
        ignoreElements(),
        catchError((error) => {
          log.error('Error updating non-closing balance-proof, ignoring', error);
          return EMPTY;
        }),
      );
    }),
  );
}
