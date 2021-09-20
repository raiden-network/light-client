import { concat as concatBytes } from '@ethersproject/bytes';
import type { Observable } from 'rxjs';
import { combineLatest, defer, EMPTY, of } from 'rxjs';
import {
  catchError,
  distinctUntilKeyChanged,
  filter,
  first,
  ignoreElements,
  map,
  mergeMap,
  pluck,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import { createBalanceHash } from '../../messages/utils';
import type { RaidenState } from '../../state';
import { Direction } from '../../transfers/state';
import { findBalanceProofMatchingBalanceHash$ } from '../../transfers/utils';
import { getPresencesByAddress, peerIsOnlineLC } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { encode } from '../../utils/data';
import { commonAndFailTxErrors, ErrorCodes, networkErrors, RaidenError } from '../../utils/error';
import { completeWith, retryWhile, takeIf } from '../../utils/rx';
import type { Hash, HexString } from '../../utils/types';
import { channelSettle, channelSettleable, newBlock } from '../actions';
import type { Channel } from '../state';
import { ChannelState } from '../state';
import { assertTx, channelKey } from '../utils';

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelSettleable actions
 */
export function channelSettleableEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelSettleable> {
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(state$),
    mergeMap(function* ([currentBlock, state]) {
      for (const channel of Object.values(state.channels)) {
        if (
          channel.state === ChannelState.closed &&
          currentBlock >= channel.closeBlock + channel.settleTimeout
        ) {
          yield channelSettleable(
            { settleableBlock: currentBlock },
            { tokenNetwork: channel.tokenNetwork, partner: channel.partner.address },
          );
        }
      }
    }),
  );
}

/**
 * If config.autoSettle is true, calls channelSettle.request on settleable channels
 * If partner is a LC and not the closing side, they're expected to wait [config.revealTimeout]
 * after channel becomes settleable before attempting to auto-settle, so we should attempt it
 * earlier [config.confirmationBlocks] after settleable. PCs always attempt earlier, so we should
 * wait longer regardless of who closed the channel, to avoid races and wasted gas; if even after
 * waiting (earlier or later) channel isn't settling/settled, we do it anyway.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.address - Our address
 * @returns Observable of channelSettle.request actions
 */
export function channelAutoSettleEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, config$ }: RaidenEpicDeps,
): Observable<channelSettle.request> {
  return state$.pipe(
    distinctUntilKeyChanged('blockNumber'),
    withLatestFrom(config$, action$.pipe(getPresencesByAddress())),
    mergeMap(function* ([
      { blockNumber, channels },
      { confirmationBlocks, revealTimeout },
      presences,
    ]) {
      for (const channel of Object.values(channels)) {
        if (channel.state !== ChannelState.settleable) continue;

        const partnerIsOnlineLC = peerIsOnlineLC(presences[channel.partner.address]);
        /* iff we are *sure* partner will wait longer (i.e. they're a LC and *we* are the closing
         * side), then we autoSettle early; otherwise (it's a PC or they're the closing side),
         * we can wait longer before autoSettling */
        let waitConfirmations: number;
        if (partnerIsOnlineLC && channel.closeParticipant === address)
          waitConfirmations = confirmationBlocks;
        else waitConfirmations = revealTimeout;

        // not yet good to go, maybe partner is settling; skip and test later
        if (blockNumber < channel.closeBlock + channel.settleTimeout + waitConfirmations) continue;

        yield channelSettle.request(undefined, {
          tokenNetwork: channel.tokenNetwork,
          partner: channel.partner.address,
        });
      }
    }),
    takeIf(config$.pipe(pluck('autoSettle'), completeWith(state$))),
  );
}

function settleSettleableChannel(
  [action$, action]: readonly [Observable<RaidenAction>, channelSettle.request],
  channel: Channel & {
    state: ChannelState.closed | ChannelState.settleable | ChannelState.settling;
  },
  tokenNetworkContract: ReturnType<RaidenEpicDeps['getTokenNetworkContract']>,
  {
    address,
    db,
    config$,
    latest$,
    log,
    provider,
  }: Pick<RaidenEpicDeps, 'address' | 'db' | 'config$' | 'latest$' | 'log' | 'provider'>,
) {
  const { tokenNetwork, partner } = action.meta;

  // fetch closing/updated balanceHash for each end
  return defer(() =>
    Promise.all([
      tokenNetworkContract.callStatic.getChannelParticipantInfo(channel.id, address, partner),
      tokenNetworkContract.callStatic.getChannelParticipantInfo(channel.id, partner, address),
    ]),
  ).pipe(
    retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
    mergeMap(([{ 3: ownBH }, { 3: partnerBH }]) => {
      let ownBP$;
      if (ownBH === createBalanceHash(channel.own.balanceProof)) {
        ownBP$ = of(channel.own.balanceProof);
      } else {
        // partner closed/updated the channel with a non-latest BP from us
        // they would lose our later transfers, but to settle we must search transfer history
        ownBP$ = findBalanceProofMatchingBalanceHash$(
          db,
          channel,
          Direction.SENT,
          ownBH as Hash,
        ).pipe(
          catchError(() => {
            throw new RaidenError(ErrorCodes.CNL_SETTLE_INVALID_BALANCEHASH, {
              address,
              ownBalanceHash: ownBH,
            });
          }),
        );
      }

      let partnerBP$;
      if (partnerBH === createBalanceHash(channel.partner.balanceProof)) {
        partnerBP$ = of(channel.partner.balanceProof);
      } else {
        // shouldn't happen, since it's expected we were the closing part
        partnerBP$ = findBalanceProofMatchingBalanceHash$(
          db,
          channel,
          Direction.RECEIVED,
          partnerBH as Hash,
        ).pipe(
          catchError(() => {
            throw new RaidenError(ErrorCodes.CNL_SETTLE_INVALID_BALANCEHASH, {
              address,
              partnerBalanceHash: partnerBH,
            });
          }),
        );
      }

      // send settleChannel transaction
      return combineLatest([ownBP$, partnerBP$]).pipe(
        map(([ownBP, partnerBP]) => {
          // part1 total amounts must be <= part2 total amounts on settleChannel call
          if (
            partnerBP.transferredAmount
              .add(partnerBP.lockedAmount)
              .lt(ownBP.transferredAmount.add(ownBP.lockedAmount))
          )
            return [
              [partner, partnerBP],
              [address, ownBP],
            ] as const;
          else
            return [
              [address, ownBP],
              [partner, partnerBP],
            ] as const;
        }),
        withLatestFrom(latest$),
        mergeMap(([[part1, part2], { gasPrice }]) =>
          defer(() =>
            tokenNetworkContract.settleChannel(
              channel.id,
              part1[0],
              part1[1].transferredAmount,
              part1[1].lockedAmount,
              part1[1].locksroot,
              part2[0],
              part2[1].transferredAmount,
              part2[1].lockedAmount,
              part2[1].locksroot,
              { ...gasPrice },
            ),
          ).pipe(
            assertTx('settleChannel', ErrorCodes.CNL_SETTLE_FAILED, { log, provider }),
            retryWhile(intervalFromConfig(config$), {
              maxRetries: 3,
              onErrors: commonAndFailTxErrors,
              log: log.info,
            }),
            // if channel gets settled while retrying (e.g. by partner), give up
            takeUntil(
              action$.pipe(
                filter(channelSettle.success.is),
                filter(
                  (action) =>
                    action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
                ),
              ),
            ),
          ),
        ),
      );
    }),
    // if succeeded, return a empty/completed observable
    // actual ChannelSettledAction will be detected and handled by channelEventsEpic
    // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
    // will then emit the channelSettle.failure action instead
    ignoreElements(),
    catchError((error) => of(channelSettle.failure(error, action.meta))),
  );
}

function withdrawPairToCoopSettleParams([req, conf]: NonNullable<
  NonNullable<channelSettle.request['payload']>['coopSettle']
>[number]) {
  return {
    participant: req.participant,
    total_withdraw: req.total_withdraw,
    expiration_block: req.expiration,
    participant_signature: req.signature,
    partner_signature: conf.signature,
  };
}

function coopSettleChannel(
  [action$, action]: readonly [Observable<RaidenAction>, channelSettle.request],
  channel: Channel & { state: ChannelState.open | ChannelState.closing },
  tokenNetworkContract: ReturnType<RaidenEpicDeps['getTokenNetworkContract']>,
  {
    config$,
    latest$,
    log,
    provider,
  }: Pick<RaidenEpicDeps, 'config$' | 'latest$' | 'log' | 'provider'>,
) {
  const { tokenNetwork, partner } = action.meta;
  const [part1, part2] = action.payload!.coopSettle!;

  // fetch closing/updated balanceHash for each end
  return latest$.pipe(
    first(),
    mergeMap(async ({ gasPrice }) =>
      tokenNetworkContract.cooperativeSettle(
        channel.id,
        withdrawPairToCoopSettleParams(part1),
        withdrawPairToCoopSettleParams(part2),
        { ...gasPrice },
      ),
    ),
    assertTx('cooperativeSettle', ErrorCodes.CNL_COOP_SETTLE_FAILED, { log, provider }),
    retryWhile(intervalFromConfig(config$), {
      maxRetries: 3,
      onErrors: commonAndFailTxErrors,
      log: log.info,
    }),
    // if channel gets settled while retrying (e.g. by partner), give up
    takeUntil(
      action$.pipe(
        filter(channelSettle.success.is),
        filter(
          (action) => action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
        ),
      ),
    ),
    // if succeeded, return a empty/completed observable
    // actual ChannelSettledAction will be detected and handled by channelEventsEpic
    // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
    // will then emit the channelSettle.failure action instead
    ignoreElements(),
    catchError((error) => of(channelSettle.failure(error, action.meta))),
  );
}

/**
 * A ChannelSettle action requested by user
 * Needs to be called on an settleable or settling (for retries) channel.
 * If tx goes through successfuly, stop as ChannelSettled success action will instead be detected
 * and reacted by channelEventsEpic.
 * If anything detectable goes wrong, fires a ChannelSettleActionFailed instead
 *
 * @param action$ - Observable of channelSettle actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @param deps.db - Database instance
 * @returns Observable of channelSettle.failure actions
 */
export function channelSettleEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<channelSettle.failure> {
  const { signer, address, main, getTokenNetworkContract, config$ } = deps;
  return action$.pipe(
    filter(channelSettle.request.is),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const { tokenNetwork } = action.meta;
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload?.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      const channel = state.channels[channelKey(action.meta)];
      if (channel?.state === ChannelState.settleable || channel?.state === ChannelState.settling) {
        return settleSettleableChannel([action$, action], channel, tokenNetworkContract, deps);
      } else if (
        action.payload?.coopSettle &&
        (channel?.state === ChannelState.open || channel?.state === ChannelState.closing)
      ) {
        return coopSettleChannel([action$, action], channel, tokenNetworkContract, deps);
      } else {
        return of(
          channelSettle.failure(
            new RaidenError(ErrorCodes.CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND, action.meta),
            action.meta,
          ),
        );
      }
    }),
  );
}

/**
 * When channel is settled, unlock any pending lock on-chain
 * TODO: check if it's worth it to also unlock partner's end
 * TODO: do it only if economically viable (and define what that means)
 *
 * @param action$ - Observable of channelSettle.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Empty observable
 */
export function channelUnlockEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    provider,
    getTokenNetworkContract,
    config$,
    latest$,
  }: RaidenEpicDeps,
): Observable<channelSettle.failure> {
  return action$.pipe(
    filter(isActionOf(channelSettle.success)),
    filter((action) => !!(action.payload.confirmed && action.payload.locks?.length)),
    withLatestFrom(state$, config$, latest$),
    // ensure there's no channel, or if yes, it's a different (by channelId)
    filter(([action, state]) => state.channels[channelKey(action.meta)]?.id !== action.payload.id),
    mergeMap(([action, , { subkey }, { gasPrice }]) => {
      const { tokenNetwork, partner } = action.meta;
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        chooseOnchainAccount({ signer, address, main }, subkey).signer,
      );
      const locks = concatBytes(
        action.payload.locks!.reduce(
          (acc, lock) => [
            ...acc,
            encode(lock.expiration, 32),
            encode(lock.amount, 32),
            lock.secrethash,
          ],
          [] as HexString[],
        ),
      );

      // send unlock transaction
      return defer(() =>
        tokenNetworkContract.unlock(action.payload.id, address, partner, locks, { ...gasPrice }),
      ).pipe(
        assertTx('unlock', ErrorCodes.CNL_ONCHAIN_UNLOCK_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), {
          maxRetries: 3,
          onErrors: commonAndFailTxErrors,
          log: log.info,
        }),
        ignoreElements(),
        catchError((error) => {
          log.error('Error unlocking pending locks on-chain, ignoring', error);
          return EMPTY;
        }),
      );
    }),
  );
}
