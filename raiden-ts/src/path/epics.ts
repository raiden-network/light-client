/* eslint-disable @typescript-eslint/camelcase */
import { Observable, of, combineLatest, from, EMPTY, merge } from 'rxjs';
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
  pluck,
  distinctUntilChanged,
  groupBy,
  switchMap,
  scan,
  startWith,
  tap,
  delay,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { isActionOf, ActionType } from 'typesafe-actions';
import { bigNumberify, BigNumber } from 'ethers/utils';
import { Zero, Two } from 'ethers/constants';
import { Event } from 'ethers/contract';
import { isNil } from 'lodash';

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
import { getEventsStream } from '../utils/ethers';
import { pathFind, pathFound, pathFindFailed, pfsListUpdated } from './actions';
import { channelCanRoute, pfsInfo, pfsListInfo } from './utils';
import { PathResults, Paths } from './types';

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pathFound|pathFindFailed actions
 */
export const pathFindServiceEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<ActionType<typeof pathFound | typeof pathFindFailed>> =>
  combineLatest(
    state$,
    getPresences$(action$),
    deps.config$, // don't need to be cached, but here to avoid separate withLatestFrom
    action$.pipe(
      filter(isActionOf(pfsListUpdated)),
      pluck('payload', 'pfsList'),
      startWith([] as readonly Address[]),
    ),
  ).pipe(
    publishReplay(1, undefined, cached$ => {
      return action$.pipe(
        filter(isActionOf(pathFind)),
        concatMap(action =>
          cached$.pipe(
            first(),
            mergeMap(([state, presences, { pfs: configPfs, httpTimeout, pfsSafetyMargin }]) => {
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
              ) {
                return of([{ path: [state.address, target], fee: Zero as Int<32> }]);
              } else if (!action.payload.pfs && configPfs === null) {
                // pfs not specified in action and disabled (null) in config
                throw new Error(`PFS disabled and no direct route available`);
              } else {
                // else, request a route from PFS.
                // pfs$ - Observable which emits one PFS info and then completes
                const pfs$ = action.payload.pfs
                  ? // first, honor action.payload.pfs
                    of(action.payload.pfs)
                  : !isNil(configPfs)
                  ? // or if config.pfs isn't disabled nor auto (undefined), use it
                    // configPfs is addr or url, so fetch pfsInfo from it
                    pfsInfo(configPfs, deps)
                  : // else (config.pfs undefined, auto mode)
                    cached$.pipe(
                      pluck(3), // get cached pfsList (4th combined value)
                      // if needed, wait for list to be populated
                      first(pfsList => pfsList.length > 0),
                      // fetch pfsInfo from whole list & sort it
                      mergeMap(pfsList => pfsListInfo(pfsList, deps)),
                      tap(pfss => console.log('Auto-selecting best PFS from:', pfss)),
                      // pop best ranked
                      pluck(0),
                    );
                return pfs$.pipe(
                  // TODO: use pfs.price to create & sign IOU
                  mergeMap(pfs =>
                    fromFetch(`${pfs.url}/api/v1/${tokenNetwork}/paths`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: losslessStringify({
                        from: deps.address,
                        to: target,
                        value: UInt(32).encode(action.meta.value),
                        max_paths: 10,
                      }),
                    }),
                  ),
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
                    (results: PathResults): Paths =>
                      results.result.map(r => ({
                        path: r.path,
                        // Add PFS safety margin to estimated fees
                        fee: r.estimated_fee
                          .mul(Math.round(pfsSafetyMargin * 1e6))
                          .div(1e6) as Int<32>,
                      })),
                  ),
                );
              }
            }),
            withLatestFrom(cached$),
            // validate/cleanup received routes/paths/results
            map(([paths, [state, presences]]) => {
              const filteredPaths: Paths = [],
                invalidatedRecipients = new Set<Address>();
              // eslint-disable-next-line prefer-const
              for (let { path, fee } of paths) {
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
              return pathFound({ paths: filteredPaths }, action.meta);
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

/**
 * Fetch & monitors ServiceRegistry's RegisteredService events, keep track of valid_till expiration
 * and aggregate list of valid service addresses
 *
 * Notice this epic only deals with the events & addresses, and don't fetch URLs, which need to be
 * fetched on-demand through [[pfsInfo]] & [[pfsListInfo]].
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pfsListUpdated actions
 */
export const pfsServiceRegistryMonitorEpic = (
  {  }: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { serviceRegistryContract, contractsInfo, config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof pfsListUpdated>> =>
  config$.pipe(
    // monitors config.pfs, and only monitors contract if it's undefined
    pluck('pfs'),
    distinctUntilChanged(),
    switchMap(pfs =>
      pfs !== undefined
        ? // disable ServiceRegistry monitoring if/while pfs is null=disabled or set
          EMPTY
        : // type of elements emitted by getEventsStream (past and new events coming from contract):
          // [service, valid_till, deposit_amount, deposit_contract, Event]
          getEventsStream<[Address, BigNumber, UInt<32>, Address, Event]>(
            serviceRegistryContract,
            [serviceRegistryContract.filters.RegisteredService(null, null, null, null)],
            of(contractsInfo.ServiceRegistry.block_number), // at boot, always fetch from deploy block
          ).pipe(
            groupBy(([service]) => service),
            mergeMap(grouped$ =>
              grouped$.pipe(
                // switchMap ensures new events for each server (grouped$) picks latest event
                switchMap(([service, valid_till]) => {
                  const now = Date.now(),
                    validTill = valid_till.mul(1000); // milliseconds valid_till
                  if (validTill.lt(now)) return EMPTY; // this event already expired
                  // end$ will emit valid=false iff <2^31 ms in the future (setTimeout limit)
                  const end$ = validTill.sub(now).lt(Two.pow(31))
                    ? of({ service, valid: false }).pipe(delay(new Date(validTill.toNumber())))
                    : EMPTY;
                  return merge(of({ service, valid: true }), end$);
                }),
              ),
            ),
            scan(
              (acc, { service, valid }) =>
                !valid && acc.includes(service)
                  ? acc.filter(s => s !== service)
                  : valid && !acc.includes(service)
                  ? [...acc, service]
                  : acc,
              [] as readonly Address[],
            ),
            distinctUntilChanged(),
            debounceTime(1e3), // debounce burst of updates on initial fetch
            map(pfsList => pfsListUpdated({ pfsList })),
          ),
    ),
  );
