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
import { isLeft } from 'fp-ts/lib/Either';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
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
import { Address, UInt } from '../utils/types';
import { losslessStringify } from '../utils/data';
import { pathFind, pathFound, pathFindFailed } from './actions';
import { channelCanRoute } from './utils';
import { PathResults } from './types';

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
                throw new Error(`PFS: target ${target} not available in transport`);
              // if pathFind received a metadata, pass it through to validation/cleanup
              if (action.payload.metadata) return of(action.payload.metadata);
              // else, if possible, use a direct transfer
              else if (
                channelCanRoute(state, presences, tokenNetwork, target, action.meta.value) === true
              )
                return of({ routes: [{ route: [state.address, target] }] });
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
                    if (!response.ok)
                      throw new Error(
                        `PFS: paths request: code=${
                          response.status
                        } => body=${await response.text()}`,
                      );
                    const decoded = PathResults.decode(await response.json());
                    if (isLeft(decoded)) throw ThrowReporter.report(decoded);
                    return decoded.right;
                  }),
                  map(({ result }) => ({
                    routes: result
                      .slice()
                      .sort(({ estimated_fee: a }, { estimated_fee: b }) => a - b)
                      .map(({ path }) => ({ route: path })),
                  })),
                );
              } else {
                throw new Error(`PFS disabled and no direct route available`);
              }
            }),
            withLatestFrom(statePresencesConfig$),
            // validate/cleanup received routes/metadata
            map(([{ routes: result }, [state, presences]]) => {
              const routes: { route: readonly Address[] }[] = [],
                invalidatedRecipients = new Set<Address>();
              for (let { route } of result) {
                // if route has us as first hop, cleanup/shift
                if (route[0] === state.address) route = route.slice(1);
                const recipient = route[0];
                // if this recipient was already invalidated in a previous iteration, skip
                if (invalidatedRecipients.has(recipient)) continue;
                // if we already found some valid route, allow only new routes through this peer
                const canTransferOrReason = !routes.length
                  ? channelCanRoute(
                      state,
                      presences,
                      action.meta.tokenNetwork,
                      recipient,
                      action.meta.value,
                    )
                  : recipient !== routes[0].route[0]
                  ? 'path: already selected another recipient'
                  : true;
                if (canTransferOrReason !== true) {
                  console.debug(
                    'Invalidated received route! Reason:',
                    canTransferOrReason,
                    'Route:',
                    route,
                  );
                  invalidatedRecipients.add(recipient);
                  continue;
                }
                routes.push({ route });
              }
              if (!routes.length) throw new Error(`PFS: validated routes are empty`);
              return pathFound({ metadata: { routes } }, action.meta);
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
