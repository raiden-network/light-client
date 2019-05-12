import { ofType } from 'redux-observable';
import { Observable, defer, of, merge, EMPTY } from 'rxjs';
import { filter, map, mergeMap, takeUntil } from 'rxjs/operators';

import { Event } from 'ethers/contract';
import { BigNumber } from 'ethers/utils';

import { getEventsStream } from '../../utils';
import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import {
  RaidenActionType,
  RaidenActions,
  TokenMonitoredAction,
  ChannelOpenedAction,
  ChannelMonitoredAction,
  ChannelDepositedAction,
  ChannelClosedAction,
  ChannelSettledAction,
  channelOpened,
  channelDeposited,
  channelClosed,
  channelSettled,
  MatrixRequestMonitorPresenceAction,
  matrixRequestMonitorPresence,
} from '../actions';

/**
 * Starts monitoring a token network for events
 * When this action goes through (because a former or new token registry event was deteceted),
 * subscribe to events and emit respective actions to the stream. Currently:
 * - ChannelOpened events with us or by us
 */
export const tokenMonitoredEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, getTokenNetworkContract, contractsInfo }: RaidenEpicDeps,
): Observable<ChannelOpenedAction> =>
  action$.pipe(
    ofType<RaidenActions, TokenMonitoredAction>(RaidenActionType.TOKEN_MONITORED),
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, partner1, partner2, settleTimeout, Event]
      type ChannelOpenedEvent = [BigNumber, string, string, BigNumber, Event];

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
              action.first ? of(contractsInfo.TokenNetworkRegistry.block_number) : undefined,
              action.first ? state$.pipe(map(state => state.blockNumber)) : undefined,
            ).pipe(
              filter(([, p1, p2]) => p1 === address || p2 === address),
              map(([id, p1, p2, settleTimeout, event]) =>
                channelOpened(
                  tokenNetworkContract.address,
                  address === p1 ? p2 : p1,
                  id.toNumber(),
                  settleTimeout.toNumber(),
                  event.blockNumber!,
                  event.transactionHash!,
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
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelDepositedAction | ChannelClosedAction | ChannelSettledAction> =>
  action$.pipe(
    ofType<RaidenActions, ChannelMonitoredAction>(RaidenActionType.CHANNEL_MONITORED),
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, participant, totalDeposit, Event]
      type ChannelNewDepositEvent = [BigNumber, string, BigNumber, Event];
      // [channelId, participant, nonce, Event]
      type ChannelClosedEvent = [BigNumber, string, BigNumber, Event];
      // [channelId, participant, nonce, Event]
      type ChannelSettledEvent = [BigNumber, BigNumber, BigNumber, Event];

      const depositFilter = tokenNetworkContract.filters.ChannelNewDeposit(action.id, null, null),
        closedFilter = tokenNetworkContract.filters.ChannelClosed(action.id, null, null),
        settledFilter = tokenNetworkContract.filters.ChannelSettled(action.id, null, null);

      // observable that emits iff this channel was settled and therefore was removed from state
      const unsubscribeChannelNotification = action$.pipe(
        ofType<RaidenActions, ChannelSettledAction>(RaidenActionType.CHANNEL_SETTLED),
        filter(
          settled => settled.tokenNetwork === action.tokenNetwork && settled.id === action.id,
        ),
      );

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
                action.fromBlock ? of(action.fromBlock) : undefined,
                action.fromBlock ? state$.pipe(map(state => state.blockNumber)) : undefined,
              ).pipe(
                map(([id, participant, totalDeposit, event]) =>
                  channelDeposited(
                    action.tokenNetwork,
                    action.partner,
                    id.toNumber(),
                    participant,
                    totalDeposit,
                    event.transactionHash!,
                  ),
                ),
              ),
              getEventsStream<ChannelClosedEvent>(
                tokenNetworkContract,
                [closedFilter],
                action.fromBlock ? of(action.fromBlock) : undefined,
                action.fromBlock ? state$.pipe(map(state => state.blockNumber)) : undefined,
              ).pipe(
                map(([id, participant, , event]) =>
                  channelClosed(
                    action.tokenNetwork,
                    action.partner,
                    id.toNumber(),
                    participant,
                    event.blockNumber!,
                    event.transactionHash!,
                  ),
                ),
              ),
              getEventsStream<ChannelSettledEvent>(
                tokenNetworkContract,
                [settledFilter],
                action.fromBlock ? of(action.fromBlock) : undefined,
                action.fromBlock ? state$.pipe(map(state => state.blockNumber)) : undefined,
              ).pipe(
                map(([id, , , event]) =>
                  channelSettled(
                    action.tokenNetwork,
                    action.partner,
                    id.toNumber(),
                    event.blockNumber!,
                    event.transactionHash!,
                  ),
                ),
              ),
            ).pipe(takeUntil(unsubscribeChannelNotification)),
      );
    }),
  );

/**
 * Channel monitoring triggers matrix presence monitoring for partner
 */
export const channelMatrixMonitorPresenceEpic = (
  action$: Observable<RaidenActions>,
): Observable<MatrixRequestMonitorPresenceAction> =>
  action$.pipe(
    ofType<RaidenActions, ChannelMonitoredAction>(RaidenActionType.CHANNEL_MONITORED),
    map(action => matrixRequestMonitorPresence(action.partner)),
  );
