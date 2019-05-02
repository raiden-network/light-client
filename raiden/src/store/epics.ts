import { ofType } from 'redux-observable';
import { Observable, defer, from, of, merge, interval, EMPTY } from 'rxjs';
import {
  catchError,
  filter,
  ignoreElements,
  map,
  mergeMap,
  mergeMapTo,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { get, findKey, isEmpty } from 'lodash';

import { Event } from 'ethers/contract';
import { HashZero, Zero } from 'ethers/constants';
import { BigNumber } from 'ethers/utils';

import { fromEthersEvent, getEventsStream } from '../utils';
import { RaidenEpicDeps } from '../types';
import { RaidenState, Channel, ChannelState } from './state';
import {
  RaidenActionType,
  RaidenActions,
  RaidenInitAction,
  NewBlockAction,
  TokenMonitoredAction,
  ChannelOpenAction,
  ChannelOpenedAction,
  ChannelOpenActionFailed,
  ChannelMonitoredAction,
  ChannelDepositAction,
  ChannelDepositedAction,
  ChannelDepositActionFailed,
  ChannelCloseAction,
  ChannelClosedAction,
  ChannelCloseActionFailed,
  ChannelSettleableAction,
  ChannelSettleAction,
  ChannelSettledAction,
  ChannelSettleActionFailed,
  RaidenShutdownAction,
  ShutdownReason,
  raidenShutdown,
  newBlock,
  tokenMonitored,
  channelOpened,
  channelOpenFailed,
  channelMonitored,
  channelDeposited,
  channelDepositFailed,
  channelClosed,
  channelCloseFailed,
  channelSettleable,
  channelSettled,
  channelSettleFailed,
} from './actions';
import { SignatureZero } from '../constants';

/**
 * This epic simply pipes all states to stateOutput$ subject injected as dependency
 */
export const stateOutputEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { stateOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  state$.pipe(
    tap(
      stateOutput$.next.bind(stateOutput$),
      stateOutput$.error.bind(stateOutput$),
      stateOutput$.complete.bind(stateOutput$),
    ),
    ignoreElements(),
  );

/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 */
export const actionOutputEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  action$.pipe(
    tap(
      actionOutput$.next.bind(actionOutput$),
      actionOutput$.error.bind(actionOutput$),
      actionOutput$.complete.bind(actionOutput$),
    ),
    ignoreElements(),
  );

/**
 * Initialization actions
 * - NewBlock events polling
 * - monitoring TokenNetworks
 * - monitoring open Channels
 */
export const raidenInitializationEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, network, provider, registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<
  NewBlockAction | TokenMonitoredAction | ChannelMonitoredAction | RaidenShutdownAction
> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    withLatestFrom(state$),
    mergeMap(([, state]) =>
      merge(
        // newBlock events
        fromEthersEvent<number>(provider, 'block').pipe(map(newBlock)),
        // monitor old (in case of empty token2tokenNetwork) and new registered tokens
        // and starts monitoring every registered token
        getEventsStream<[string, string, Event]>(
          registryContract,
          [registryContract.filters.TokenNetworkCreated(null, null)],
          isEmpty(state.token2tokenNetwork)
            ? of(contractsInfo.TokenNetworkRegistry.block_number)
            : undefined,
          isEmpty(state.token2tokenNetwork) ? of(state.blockNumber) : undefined,
        ).pipe(
          withLatestFrom(state$),
          map(([[token, tokenNetwork], state]) =>
            tokenMonitored(token, tokenNetwork, !(token in state.token2tokenNetwork)),
          ),
        ),
        // monitor previously monitored tokens
        from(Object.entries(state.token2tokenNetwork)).pipe(
          map(([token, tokenNetwork]) => tokenMonitored(token, tokenNetwork)),
        ),
        // monitor all on-chain channels (which have ids)
        from(Object.entries(state.tokenNetworks)).pipe(
          mergeMap(([tokenNetwork, obj]) =>
            from(Object.entries(obj)).pipe(
              filter(([, channel]) => channel.id !== undefined),
              // typescript doesn't understand above filter guarantees id below will be set
              map(([partner, channel]) => channelMonitored(tokenNetwork, partner, channel.id!)),
            ),
          ),
        ),
        // at init time, check if our address is in provider's accounts list
        // if not, it means Signer is a local Wallet or another non-provider-side account
        // if yes, poll accounts every 1s and monitors if address is still there
        // also, every 1s poll current provider network and monitors if it's the same
        // if any check fails, emits RaidenShutdownAction, nothing otherwise
        // Poll reason from: https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md
        from(provider.listAccounts()).pipe(
          // first/init-time check
          map(accounts => accounts.includes(address)),
          mergeMap(isProviderAccount =>
            interval(provider.pollingInterval).pipe(
              mergeMap(() =>
                merge(
                  isProviderAccount // if isProviderAccount, also polls and monitors accounts list
                    ? from(provider.listAccounts()).pipe(
                        mergeMap(accounts =>
                          !accounts.includes(address)
                            ? of(raidenShutdown(ShutdownReason.ACCOUNT_CHANGED))
                            : EMPTY,
                        ),
                      )
                    : EMPTY,
                  from(provider.getNetwork()).pipe(
                    // unconditionally monitors network changes
                    mergeMap(curNetwork =>
                      curNetwork.chainId !== network.chainId
                        ? of(raidenShutdown(ShutdownReason.NETWORK_CHANGED))
                        : EMPTY,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 */
export const newBlockEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
): Observable<ChannelSettleableAction> =>
  action$.pipe(
    ofType<RaidenActions, NewBlockAction>(RaidenActionType.NEW_BLOCK),
    withLatestFrom(state$),
    mergeMap(function*([{ blockNumber }, state]) {
      for (const tokenNetwork in state.tokenNetworks) {
        for (const partner in state.tokenNetworks[tokenNetwork]) {
          const channel = state.tokenNetworks[tokenNetwork][partner];
          if (
            channel.state === ChannelState.closed &&
            channel.settleTimeout && // closed channels always have settleTimeout & closeBlock set
            channel.closeBlock &&
            blockNumber > channel.closeBlock + channel.settleTimeout
          ) {
            yield channelSettleable(tokenNetwork, partner, blockNumber);
          }
        }
      }
    }),
  );

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
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as ChannelOpened success action
 * will instead be detected and fired by tokenMonitoredEpic. If anything detectable goes wrong,
 * fires a ChannnelOpenActionFailed instead
 */
export const channelOpenEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelOpenActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelOpenAction>(RaidenActionType.CHANNEL_OPEN),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetwork = getTokenNetworkContract(action.tokenNetwork);
      const channelState = get(state.tokenNetworks, [
        action.tokenNetwork,
        action.partner,
        'state',
      ]);
      // proceed only if channel is in 'opening' state, set by this action
      if (channelState !== ChannelState.opening)
        return of(
          channelOpenFailed(
            action.tokenNetwork,
            action.partner,
            new Error(`Invalid channel state: ${channelState}`),
          ),
        );

      // send openChannel transaction !!!
      return from(
        tokenNetwork.functions.openChannel(state.address, action.partner, action.settleTimeout),
      ).pipe(
        mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
        map(({ receipt, tx }) => {
          if (!receipt.status) throw new Error(`openChannel transaction "${tx.hash}" failed`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelOpenedAction will be detected and handled by tokenMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelOpenFailed action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelOpenFailed(action.tokenNetwork, action.partner, error))),
      );
    }),
  );

/**
 * When we see a new ChannelOpenedAction event, starts monitoring channel
 */
export const channelOpenedEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
): Observable<ChannelMonitoredAction> =>
  action$.pipe(
    ofType<RaidenActions, ChannelOpenedAction>(RaidenActionType.CHANNEL_OPENED),
    withLatestFrom(state$),
    // proceed only if channel is in 'open' state and a deposit is required
    filter(([action, state]) => {
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      return channel && channel.state === ChannelState.open;
    }),
    map(([action]) =>
      channelMonitored(
        action.tokenNetwork,
        action.partner,
        action.id,
        action.openBlock, // fetch past events as well, if needed
      ),
    ),
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
 * A ChannelDeposit action requested by user
 * Needs to be called on a previously monitored channel. Calls Token.approve for TokenNetwork
 * and then set respective setTotalDeposit. If all tx go through successfuly, stop as
 * ChannelDeposited success action will instead be detected and reacted by
 * channelMonitoredEpic. If anything detectable goes wrong, fires a ChannelDepositActionFailed
 * instead
 */
export const channelDepositEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, getTokenContract, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelDepositActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelDepositAction>(RaidenActionType.CHANNEL_DEPOSIT),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const token = findKey(state.token2tokenNetwork, tn => tn === action.tokenNetwork);
      if (!token) {
        const error = new Error(`token for tokenNetwork "${action.tokenNetwork}" not found`);
        return of(channelDepositFailed(action.tokenNetwork, action.partner, error));
      }
      const tokenContract = getTokenContract(token);
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      if (!channel || channel.state !== ChannelState.open || channel.id === undefined) {
        const error = new Error(
          `channel for "${action.tokenNetwork}" and "${
            action.partner
          }" not found or not in 'open' state`,
        );
        return of(channelDepositFailed(action.tokenNetwork, action.partner, error));
      }
      const channelId = channel.id;

      // send approve transaction
      return from(tokenContract.functions.approve(action.tokenNetwork, action.deposit))
        .pipe(
          tap(tx => console.log(`sent approve tx "${tx.hash}" to "${token}"`)),
          mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
          map(({ receipt, tx }) => {
            if (!receipt.status)
              throw new Error(`token "${token}" approve transaction "${tx.hash}" failed`);
            return tx.hash;
          }),
          tap(txHash => console.log(`approve tx "${txHash}" successfuly mined!`)),
        )
        .pipe(
          withLatestFrom(state$),
          mergeMap(([, state]) =>
            // send setTotalDeposit transaction
            tokenNetworkContract.functions.setTotalDeposit(
              channelId,
              address,
              state.tokenNetworks[action.tokenNetwork][action.partner].totalDeposit.add(
                action.deposit,
              ),
              action.partner,
              { gasLimit: 100e3 },
            ),
          ),
          tap(tx =>
            console.log(`sent setTotalDeposit tx "${tx.hash}" to "${action.tokenNetwork}"`),
          ),
          mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
          map(({ receipt, tx }) => {
            if (!receipt.status)
              throw new Error(
                `tokenNetwork "${action.tokenNetwork}" setTotalDeposit transaction "${
                  tx.hash
                }" failed`,
              );
            return tx.hash;
          }),
          tap(txHash => console.log(`setTotalDeposit tx "${txHash}" successfuly mined!`)),
          // if succeeded, return a empty/completed observable
          // actual ChannelDepositedAction will be detected and handled by channelMonitoredEpic
          // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
          // will then emit the channelDepositFailed action instead
          mergeMapTo(EMPTY),
          catchError(error =>
            of(channelDepositFailed(action.tokenNetwork, action.partner, error)),
          ),
        );
    }),
  );

/**
 * A ChannelClose action requested by user
 * Needs to be called on an opened or closing (for retries) channel.
 * If tx goes through successfuly, stop as ChannelClosed success action will instead be
 * detected and reacted by channelMonitoredEpic. If anything detectable goes wrong, fires a
 * ChannelCloseActionFailed instead
 */
export const channelCloseEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelCloseActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelCloseAction>(RaidenActionType.CHANNEL_CLOSE),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      if (
        !channel ||
        !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.tokenNetwork}" and "${
            action.partner
          }" not found or not in 'open' or 'closing' state`,
        );
        return of(channelCloseFailed(action.tokenNetwork, action.partner, error));
      }
      const channelId = channel.id;

      // send closeChannel transaction
      return from(
        tokenNetworkContract.functions.closeChannel(
          channelId,
          action.partner,
          HashZero,
          0,
          HashZero,
          // FIXME: https://github.com/ethereum-ts/TypeChain/issues/123
          (SignatureZero as unknown) as string[],
        ),
      ).pipe(
        tap(tx => console.log(`sent closeChannel tx "${tx.hash}" to "${action.tokenNetwork}"`)),
        mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
        map(({ receipt, tx }) => {
          if (!receipt.status)
            throw new Error(
              `tokenNetwork "${action.tokenNetwork}" closeChannel transaction "${tx.hash}" failed`,
            );
          console.log(`closeChannel tx "${tx.hash}" successfuly mined!`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelClosedAction will be detected and handled by channelMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelCloseFailed action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelCloseFailed(action.tokenNetwork, action.partner, error))),
      );
    }),
  );

/**
 * A ChannelSettle action requested by user
 * Needs to be called on an settleable or settling (for retries) channel.
 * If tx goes through successfuly, stop as ChannelSettled success action will instead be
 * detected and reacted by channelMonitoredEpic. If anything detectable goes wrong, fires a
 * ChannelSettleActionFailed instead
 */
export const channelSettleEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelSettleActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelSettleAction>(RaidenActionType.CHANNEL_SETTLE),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      if (
        !channel ||
        !(channel.state === ChannelState.settleable || channel.state === ChannelState.settling) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.tokenNetwork}" and "${
            action.partner
          }" not found or not in 'settleable' or 'settling' state`,
        );
        return of(channelSettleFailed(action.tokenNetwork, action.partner, error));
      }
      const channelId = channel.id;

      // send settleChannel transaction
      return from(
        tokenNetworkContract.functions.settleChannel(
          channelId,
          address,
          Zero,
          Zero,
          HashZero,
          action.partner,
          Zero,
          Zero,
          HashZero,
        ),
      ).pipe(
        tap(tx => console.log(`sent settleChannel tx "${tx.hash}" to "${action.tokenNetwork}"`)),
        mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
        map(({ receipt, tx }) => {
          if (!receipt.status)
            throw new Error(
              `tokenNetwork "${action.tokenNetwork}" settleChannel transaction "${
                tx.hash
              }" failed`,
            );
          console.log(`settleChannel tx "${tx.hash}" successfuly mined!`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelSettledAction will be detected and handled by channelMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelSettleFailed action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelSettleFailed(action.tokenNetwork, action.partner, error))),
      );
    }),
  );

export const raidenEpics = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenActions> => {
  const shutdownNotification = action$.pipe(
    ofType<RaidenActions, RaidenShutdownAction>(RaidenActionType.SHUTDOWN),
  );
  // like combineEpics, but completes action$, state$ and output$ when shutdownNotification emits
  return from([
    raidenInitializationEpic,
    stateOutputEpic,
    actionOutputEpic,
    newBlockEpic,
    tokenMonitoredEpic,
    channelOpenEpic,
    channelOpenedEpic,
    channelMonitoredEpic,
    channelDepositEpic,
    channelCloseEpic,
    channelSettleEpic,
  ]).pipe(
    mergeMap(epic =>
      epic(
        action$.pipe(takeUntil(shutdownNotification)),
        state$.pipe(takeUntil(shutdownNotification)),
        deps,
      ),
    ),
    takeUntil(shutdownNotification),
    catchError(err => of(raidenShutdown(err))),
  );
};
