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
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
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
import { channelKey, transact } from '../utils';

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
 * @returns Observable of channelClose.failure actions
 */
export function channelCloseEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<channelClose.failure> {
  const { log, signer, address, network, getTokenNetworkContract, config$ } = deps;
  return action$.pipe(
    filter(isActionOf(channelClose.request)),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const { tokenNetwork, partner } = action.meta;
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
          transact(
            getTokenNetworkContract(tokenNetwork),
            'closeChannel',
            [
              channel.id,
              partner,
              address,
              balanceHash,
              nonce,
              additionalHash,
              nonClosingSignature,
              closingSignature,
            ],
            deps,
            { error: ErrorCodes.CNL_CLOSECHANNEL_FAILED },
          ).pipe(
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
 * @returns Empty observable
 */
export function channelUpdateEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<never> {
  const { log, signer, address, network, getTokenNetworkContract, config$ } = deps;
  return action$.pipe(
    filter(isActionOf(channelClose.success)),
    filter((action) => !!action.payload.confirmed),
    // wait a newBlock go through after channelClose confirmation, to ensure any pending
    // channelSettle could have been processed
    delayWhen(() => action$.pipe(filter(newBlock.is))),
    withLatestFrom(state$),
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
    mergeMap(([action, state]) => {
      const { tokenNetwork, partner } = action.meta;
      const channel = state.channels[channelKey(action.meta)]!; // checked in filter

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
      return defer(() => signer.signMessage(nonClosingMessage) as Promise<Signature>).pipe(
        mergeMap((nonClosingSignature) =>
          transact(
            getTokenNetworkContract(tokenNetwork),
            'updateNonClosingBalanceProof',
            [
              channel.id,
              partner,
              address,
              balanceHash,
              nonce,
              additionalHash,
              closingSignature,
              nonClosingSignature,
            ],
            deps,
            { error: ErrorCodes.CNL_UPDATE_NONCLOSING_BP_FAILED },
          ),
        ),
        tap({
          next: (v) => log.info('Updated channel', { channel, v }),
          error: (error) => log.info('Error updating channel', { channel, error }),
        }),
        retryWhile(intervalFromConfig(config$), {
          onErrors: commonAndFailTxErrors,
          log: log.info,
        }),
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
