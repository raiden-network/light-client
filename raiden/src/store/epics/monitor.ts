import { Observable, defer, of, merge, EMPTY } from 'rxjs';
import { filter, map, mergeMap, takeWhile } from 'rxjs/operators';
import { isActionOf, ActionType } from 'typesafe-actions';
import { negate } from 'lodash';

import { Event } from 'ethers/contract';
import { BigNumber } from 'ethers/utils';

import { Address } from '../../utils/types';
import { getEventsStream } from '../../utils/ethers';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../state';
import {
  channelOpened,
  channelDeposited,
  channelClosed,
  channelSettled,
  tokenMonitored,
  channelMonitored,
} from '../../channels/actions';
import { matrixRequestMonitorPresence } from '../../transport/actions';

/**
 * Starts monitoring a token network for events
 * When this action goes through (because a former or new token registry event was deteceted),
 * subscribe to events and emit respective actions to the stream. Currently:
 * - ChannelOpened events with us or by us
 */
export const tokenMonitoredEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, getTokenNetworkContract, contractsInfo }: RaidenEpicDeps,
): Observable<ActionType<typeof channelOpened>> =>
  action$.pipe(
    filter(isActionOf(tokenMonitored)),
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.payload.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, partner1, partner2, settleTimeout, Event]
      type ChannelOpenedEvent = [BigNumber, Address, Address, BigNumber, Event];

      const filters = [
        tokenNetworkContract.filters.ChannelOpened(null, address, null, null),
        tokenNetworkContract.filters.ChannelOpened(null, null, address, null),
      ];

      // at subscription time, if there's already a filter, skip (return completed observable)
      return defer(() =>
        tokenNetworkContract.listenerCount(filters[0])
          ? EMPTY // completed/empty observable as return
          : getEventsStream<ChannelOpenedEvent>(
              tokenNetworkContract,
              filters,
              // if first time monitoring this token network,
              // fetch TokenNetwork's pastEvents since registry deployment as fromBlock$
              action.payload.first
                ? of(contractsInfo.TokenNetworkRegistry.block_number)
                : undefined,
              action.payload.first ? state$.pipe(map(state => state.blockNumber)) : undefined,
            ).pipe(
              filter(([, p1, p2]) => p1 === address || p2 === address),
              map(([id, p1, p2, settleTimeout, event]) =>
                channelOpened(
                  {
                    id: id.toNumber(),
                    settleTimeout: settleTimeout.toNumber(),
                    openBlock: event.blockNumber!,
                    txHash: event.transactionHash!,
                  },
                  {
                    tokenNetwork: tokenNetworkContract.address,
                    partner: address === p1 ? p2 : p1,
                  },
                ),
              ),
            ),
      );
    }),
  );

/**
 * Monitors a channel for channel Events
 * Can be called either at initialization time (for previously known channels on previously
 * monitored TokenNetwork) or by a new detected ChannelOpenedAction. On the later case,
 * also fetches events since Channel.openBlock.
 * Currently monitored events:
 * - ChannelNewDeposit, fires a ChannelDepositedAction
 */
export const channelMonitoredEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<
  ActionType<typeof channelDeposited | typeof channelClosed | typeof channelSettled>
> =>
  action$.pipe(
    filter(isActionOf(channelMonitored)),
    // TODO: replace mergeMap+defer+listenerCount with groupBy+exhaustMap for concurrency control
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, participant, totalDeposit, Event]
      type ChannelNewDepositEvent = [BigNumber, Address, BigNumber, Event];
      // [channelId, participant, nonce, Event]
      type ChannelClosedEvent = [BigNumber, Address, BigNumber, Event];
      // [channelId, participant1amount, participant2amount, Event]
      type ChannelSettledEvent = [BigNumber, BigNumber, BigNumber, Event];

      // TODO: instead of one filter for each event, optimize to one filter per channel
      // it requires ethers to support OR filters for topics:
      // https://github.com/ethers-io/ethers.js/issues/437
      // can we hook to provider.on directly and decoding the events ourselves?
      const depositFilter = tokenNetworkContract.filters.ChannelNewDeposit(
          action.payload.id,
          null,
          null,
        ),
        closedFilter = tokenNetworkContract.filters.ChannelClosed(action.payload.id, null, null),
        settledFilter = tokenNetworkContract.filters.ChannelSettled(action.payload.id, null, null);

      // at subscription time, if there's already a filter, skip (return completed observable)
      return defer(() =>
        tokenNetworkContract.listenerCount(depositFilter)
          ? EMPTY // completed/empty observable as return
          : merge(
              getEventsStream<ChannelNewDepositEvent>(
                tokenNetworkContract,
                [depositFilter],
                // if channelMonitored triggered by ChannelOpenedAction,
                // fetch Channel's pastEvents since channelOpened blockNumber as fromBlock$
                action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
                action.payload.fromBlock
                  ? state$.pipe(map(state => state.blockNumber))
                  : undefined,
              ).pipe(
                map(([id, participant, totalDeposit, event]) =>
                  channelDeposited(
                    {
                      id: id.toNumber(),
                      participant,
                      totalDeposit,
                      txHash: event.transactionHash!,
                    },
                    action.meta,
                  ),
                ),
              ),
              getEventsStream<ChannelClosedEvent>(
                tokenNetworkContract,
                [closedFilter],
                action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
                action.payload.fromBlock
                  ? state$.pipe(map(state => state.blockNumber))
                  : undefined,
              ).pipe(
                map(([id, participant, , event]) =>
                  channelClosed(
                    {
                      id: id.toNumber(),
                      participant,
                      closeBlock: event.blockNumber!,
                      txHash: event.transactionHash!,
                    },
                    action.meta,
                  ),
                ),
              ),
              getEventsStream<ChannelSettledEvent>(
                tokenNetworkContract,
                [settledFilter],
                action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
                action.payload.fromBlock
                  ? state$.pipe(map(state => state.blockNumber))
                  : undefined,
              ).pipe(
                map(([id, , , event]) =>
                  channelSettled(
                    {
                      id: id.toNumber(),
                      settleBlock: event.blockNumber!,
                      txHash: event.transactionHash!,
                    },
                    action.meta,
                  ),
                ),
              ),
            ).pipe(
              // takeWhile tends to broad input to simple TypedAction. We need to narrow it by hand
              takeWhile<
                ActionType<typeof channelDeposited | typeof channelClosed | typeof channelSettled>
              >(negate(isActionOf(channelSettled)), true),
            ),
      );
    }),
  );

/**
 * Channel monitoring triggers matrix presence monitoring for partner
 */
export const channelMatrixMonitorPresenceEpic = (
  action$: Observable<RaidenAction>,
): Observable<ActionType<typeof matrixRequestMonitorPresence>> =>
  action$.pipe(
    filter(isActionOf(channelMonitored)),
    map(action => matrixRequestMonitorPresence(undefined, { address: action.meta.partner })),
  );
