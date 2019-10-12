/* eslint-disable @typescript-eslint/camelcase */
import { Observable, of, combineLatest, from, EMPTY } from 'rxjs';
import {
  filter,
  mergeMap,
  publishReplay,
  first,
  catchError,
  concatMap,
  map,
  withLatestFrom,
  timeout,
  debounceTime,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { isActionOf, ActionType } from 'typesafe-actions';
import { bigNumberify } from 'ethers/utils';
import { Zero } from 'ethers/constants';

import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { getPresences$ } from '../transport/utils';
import { messageGlobalSend } from '../messages/actions';
import { PFSCapacityUpdate, MessageType } from '../messages/types';
import { signMessage } from '../messages/utils';
import { channelDeposited } from '../channels/actions';
import { ChannelState } from '../channels/state';
import { channelAmounts } from '../channels/utils';
import { Address, UInt, Int, decode } from '../utils/types';
import { losslessStringify, losslessParse } from '../utils/data';
import { pathFind, pathFound, pathFindFailed } from './actions';
import { channelCanRoute } from './utils';
import { PathResults, Paths } from './types';

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of pathFound|pathFindFailed actions
 */
export const pathFindServiceEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof pathFound | typeof pathFindFailed>> =>
  combineLatest(state$, getPresences$(action$), config$).pipe(
    publishReplay(1, undefined, statePresencesConfig$ => {
      return action$.pipe(
        filter(isActionOf(pathFind)),
        concatMap(action =>
          statePresencesConfig$.pipe(
            first(),
            mergeMap(([state, presences, { pfs, httpTimeout }]) => {
              const { tokenNetwork, target } = action.meta;
              if (!(tokenNetwork in state.channels))
                throw new Error(`PFS: unknown tokenNetwork ${tokenNetwork}`);
              if (!(target in presences) || !presences[target].payload.available)
                throw new Error(`PFS: target ${target} not online`);
              // if pathFind received a set of paths, pass it through to validation/cleanup
              if (action.payload.paths) return of(action.payload.paths);
              // else, if possible, use a direct transfer
              else if (
                channelCanRoute(state, presences, tokenNetwork, target, action.meta.value) === true
              )
                return of({
                  paths: [{ path: [state.address, target], fee: Zero as Int<32> }],
                  feedbackToken: undefined,
                });
              // else, request a route from PFS
              else if (pfs !== null) {
                // from all channels
                return fromFetch(`${pfs}/api/v1/${tokenNetwork}/paths`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: losslessStringify({
                    from: address,
                    to: target,
                    value: UInt(32).encode(action.meta.value),
                    max_paths: 10,
                  }),
                }).pipe(
                  timeout(httpTimeout),
                  mergeMap(async response => {
                    const text = await response.text();
                    if (!response.ok)
                      throw new Error(
                        `PFS: paths request: code=${response.status} => body="${text}"`,
                      );
                    return decode(PathResults, losslessParse(text));
                  }),
                  map(
                    (results: PathResults): Paths => ({
                      paths: results.result.map(r => ({ path: r.path, fee: r.estimated_fee })),
                      feedbackToken: results.feedback_token,
                    }),
                  ),
                );
              } else {
                throw new Error(`PFS disabled and no direct route available`);
              }
            }),
            withLatestFrom(statePresencesConfig$),
            // validate/cleanup received routes/paths/results
            map(([results, [state, presences]]) => {
              const filteredPaths: Paths['paths'] = [],
                invalidatedRecipients = new Set<Address>();
              // eslint-disable-next-line prefer-const
              for (let { path, fee } of results.paths) {
                // if route has us as first hop, cleanup/shift
                if (path[0] === state.address) path = path.slice(1);
                const recipient = path[0];
                // if this recipient was already invalidated in a previous iteration, skip
                if (invalidatedRecipients.has(recipient)) continue;
                // if we already found some valid route, allow only new routes through this peer
                const canTransferOrReason = !filteredPaths.length
                  ? channelCanRoute(
                      state,
                      presences,
                      action.meta.tokenNetwork,
                      recipient,
                      action.meta.value.add(fee) as UInt<32>,
                    )
                  : recipient !== filteredPaths[0].path[0]
                  ? 'path: already selected another recipient'
                  : fee.gt(filteredPaths[0].fee)
                  ? 'path: already selected a smaller fee'
                  : true;
                if (canTransferOrReason !== true) {
                  console.log(
                    'Invalidated received route. Reason:',
                    canTransferOrReason,
                    'Route:',
                    path,
                  );
                  invalidatedRecipients.add(recipient);
                  continue;
                }
                filteredPaths.push({ path, fee });
              }
              if (!filteredPaths.length) throw new Error(`PFS: no valid routes found`);
              return pathFound(
                { paths: { paths: filteredPaths, feedbackToken: results.feedbackToken } },
                action.meta,
              );
            }),
            catchError(err => of(pathFindFailed(err, action.meta))),
          ),
        ),
      );
    }),
  );

/**
 * Sends a [[PFSCapacityUpdate]] to PFS global room on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposited actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageGlobalSend actions
 */
export const pfsCapacityUpdateEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, network, signer, config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof messageGlobalSend>> =>
  action$.pipe(
    filter(isActionOf(channelDeposited)),
    filter(action => action.payload.participant === address),
    debounceTime(10e3),
    withLatestFrom(state$, config$),
    filter(([, , { pfsRoom }]) => !!pfsRoom), // ignore actions while/if config.pfsRoom isn't set
    mergeMap(([action, state, { revealTimeout, pfsRoom }]) => {
      const channel = state.channels[action.meta.tokenNetwork][action.meta.partner];
      if (!channel || channel.state !== ChannelState.open) return EMPTY;

      const { ownCapacity, partnerCapacity } = channelAmounts(channel);

      const message: PFSCapacityUpdate = {
        type: MessageType.PFS_CAPACITY_UPDATE,
        canonical_identifier: {
          chain_identifier: bigNumberify(network.chainId) as UInt<32>,
          token_network_address: action.meta.tokenNetwork,
          channel_identifier: bigNumberify(channel.id) as UInt<32>,
        },
        updating_participant: address,
        other_participant: action.meta.partner,
        updating_nonce: channel.own.balanceProof
          ? channel.own.balanceProof.nonce
          : (Zero as UInt<8>),
        other_nonce: channel.partner.balanceProof
          ? channel.partner.balanceProof.nonce
          : (Zero as UInt<8>),
        updating_capacity: ownCapacity,
        other_capacity: partnerCapacity,
        reveal_timeout: revealTimeout,
      };

      return from(signMessage(signer, message)).pipe(
        map(signed => messageGlobalSend({ message: signed }, { roomName: pfsRoom! })),
      );
    }),
    catchError(err => {
      console.error('Error trying to generate & sign PFSCapacityUpdate', err);
      return EMPTY;
    }),
  );
