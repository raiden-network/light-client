import { Observable, from, of, EMPTY, defer, merge, interval } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  mergeMapTo,
  startWith,
  tap,
  takeWhile,
  withLatestFrom,
} from 'rxjs/operators';
import { isActionOf, ActionType } from 'typesafe-actions';
import { findKey, get, isEmpty, negate } from 'lodash';

import { BigNumber } from 'ethers/utils';
import { Event } from 'ethers/contract';
import { HashZero, Zero } from 'ethers/constants';

import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { Channel, ChannelState } from '../channels';
import { RaidenState } from '../store/state';
import {
  channelOpenFailed,
  channelMonitored,
  channelDepositFailed,
  channelCloseFailed,
  channelSettleFailed,
  channelOpen,
  channelOpened,
  channelDeposit,
  channelClose,
  channelSettle,
  channelSettleable,
  newBlock,
  tokenMonitored,
  channelDeposited,
  channelClosed,
  channelSettled,
} from './actions';
import { raidenInit, raidenShutdown } from '../store/actions';
import { SignatureZero, ShutdownReason } from '../constants';
import { Address, Hash } from '../utils/types';
import { fromEthersEvent, getEventsStream, getNetwork } from '../utils/ethers';

/**
 * Register for new block events and emit newBlock actions for new blocks
 */
export const initNewBlockEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<ActionType<typeof newBlock>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    mergeMap(() => fromEthersEvent<number>(provider, 'block')),
    map(blockNumber => newBlock({ blockNumber })),
  );

/**
 * Monitor registry for new token networks and monitor them
 */
export const initMonitorRegistryEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<ActionType<typeof tokenMonitored>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(([, state]) =>
      merge(
        // monitor old (in case of empty tokens) and new registered tokens
        // and starts monitoring every registered token
        getEventsStream<[Address, Address, Event]>(
          registryContract,
          [registryContract.filters.TokenNetworkCreated(null, null)],
          isEmpty(state.tokens) ? of(contractsInfo.TokenNetworkRegistry.block_number) : undefined,
          isEmpty(state.tokens) ? of(state.blockNumber) : undefined,
        ).pipe(
          withLatestFrom(state$.pipe(startWith(state))),
          map(([[token, tokenNetwork], state]) =>
            tokenMonitored({
              token,
              tokenNetwork,
              first: !(token in state.tokens),
            }),
          ),
        ),
        // monitor previously monitored tokens
        from(Object.entries(state.tokens)).pipe(
          map(([token, tokenNetwork]) =>
            tokenMonitored({ token: token as Address, tokenNetwork: tokenNetwork as Address }),
          ),
        ),
      ),
    ),
  );

/**
 * Monitor channels previously already on state
 */
export const initMonitorChannelsEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof channelMonitored>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(function*([, state]) {
      for (const [tokenNetwork, obj] of Object.entries(state.channels)) {
        for (const [partner, channel] of Object.entries(obj)) {
          if (channel.id !== undefined) {
            yield channelMonitored(
              { id: channel.id },
              { tokenNetwork: tokenNetwork as Address, partner: partner as Address },
            );
          }
        }
      }
    }),
  );

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 */
export const initMonitorProviderEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { address, network, provider }: RaidenEpicDeps,
): Observable<ActionType<typeof raidenShutdown>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    mergeMap(() => provider.listAccounts()),
    // at init time, check if our address is in provider's accounts list
    // if not, it means Signer is a local Wallet or another non-provider-side account
    // if yes, poll accounts every 1s and monitors if address is still there
    // also, every 1s poll current provider network and monitors if it's the same
    // if any check fails, emits RaidenShutdownAction, nothing otherwise
    // Poll reason from: https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md
    // first/init-time check
    map(accounts => accounts.includes(address)),
    mergeMap(isProviderAccount =>
      interval(provider.pollingInterval).pipe(
        mergeMap(() =>
          merge(
            // if isProviderAccount, also polls and monitors accounts list
            isProviderAccount
              ? from(provider.listAccounts()).pipe(
                  mergeMap(accounts =>
                    !accounts.includes(address)
                      ? of(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }))
                      : EMPTY,
                  ),
                )
              : EMPTY,
            // unconditionally monitors network changes
            from(getNetwork(provider)).pipe(
              mergeMap(curNetwork =>
                curNetwork.chainId !== network.chainId
                  ? of(raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }))
                  : EMPTY,
              ),
            ),
          ),
        ),
      ),
    ),
  );

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
      // TODO: replace mergeMap+defer with groupBy(token)+exhaustMap
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
                    txHash: event.transactionHash! as Hash,
                  },
                  {
                    tokenNetwork: tokenNetworkContract.address as Address,
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
      // TODO: replace mergeMap+defer+listenerCount with groupBy+exhaustMap for concurrency control
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
                      txHash: event.transactionHash! as Hash,
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
                      txHash: event.transactionHash! as Hash,
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
                      txHash: event.transactionHash! as Hash,
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
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as ChannelOpened success action
 * will instead be detected and fired by tokenMonitoredEpic. If anything detectable goes wrong,
 * fires a ChannnelOpenActionFailed instead
 */
export const channelOpenEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ActionType<typeof channelOpenFailed>> =>
  action$.pipe(
    filter(isActionOf(channelOpen)),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetwork = getTokenNetworkContract(action.meta.tokenNetwork);
      const channelState = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
        'state',
      ]);
      // proceed only if channel is in 'opening' state, set by this action
      if (channelState !== ChannelState.opening)
        return of(
          channelOpenFailed(new Error(`Invalid channel state: ${channelState}`), action.meta),
        );

      // send openChannel transaction !!!
      return from(
        tokenNetwork.functions.openChannel(
          state.address,
          action.meta.partner,
          action.payload.settleTimeout,
        ),
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
        catchError(error => of(channelOpenFailed(error, action.meta))),
      );
    }),
  );

/**
 * When we see a new ChannelOpenedAction event, starts monitoring channel
 */
export const channelOpenedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof channelMonitored>> =>
  action$.pipe(
    filter(isActionOf(channelOpened)),
    withLatestFrom(state$),
    // proceed only if channel is in 'open' state and a deposit is required
    filter(([action, state]) => {
      const channel: Channel | undefined = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      return !!channel && channel.state === ChannelState.open;
    }),
    map(([action]) =>
      channelMonitored(
        {
          id: action.payload.id,
          fromBlock: action.payload.openBlock, // fetch past events as well, if needed
        },
        action.meta,
      ),
    ),
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
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, getTokenContract, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ActionType<typeof channelDepositFailed>> =>
  action$.pipe(
    filter(isActionOf(channelDeposit)),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const token = findKey(state.tokens, tn => tn === action.meta.tokenNetwork) as
        | Address
        | undefined;
      if (!token) {
        const error = new Error(`token for tokenNetwork "${action.meta.tokenNetwork}" not found`);
        return of(channelDepositFailed(error, action.meta));
      }
      const tokenContract = getTokenContract(token);
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
      const channel: Channel = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (!channel || channel.state !== ChannelState.open || channel.id === undefined) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${action.meta.partner}" not found or not in 'open' state`,
        );
        return of(channelDepositFailed(error, action.meta));
      }
      const channelId = channel.id;

      // send approve transaction
      return from(
        tokenContract.functions.approve(action.meta.tokenNetwork, action.payload.deposit),
      )
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
              state.channels[action.meta.tokenNetwork][action.meta.partner].own.deposit.add(
                action.payload.deposit,
              ),
              action.meta.partner,
              { gasLimit: 100e3 },
            ),
          ),
          tap(tx =>
            console.log(`sent setTotalDeposit tx "${tx.hash}" to "${action.meta.tokenNetwork}"`),
          ),
          mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
          map(({ receipt, tx }) => {
            if (!receipt.status)
              throw new Error(
                `tokenNetwork "${action.meta.tokenNetwork}" setTotalDeposit transaction "${tx.hash}" failed`,
              );
            return tx.hash;
          }),
          tap(txHash => console.log(`setTotalDeposit tx "${txHash}" successfuly mined!`)),
          // if succeeded, return a empty/completed observable
          // actual ChannelDepositedAction will be detected and handled by channelMonitoredEpic
          // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
          // will then emit the channelDepositFailed action instead
          mergeMapTo(EMPTY),
          catchError(error => of(channelDepositFailed(error, action.meta))),
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
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ActionType<typeof channelCloseFailed>> =>
  action$.pipe(
    filter(isActionOf(channelClose)),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
      const channel: Channel = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (
        !channel ||
        !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${action.meta.partner}" not found or not in 'open' or 'closing' state`,
        );
        return of(channelCloseFailed(error, action.meta));
      }
      const channelId = channel.id;

      // send closeChannel transaction
      return from(
        tokenNetworkContract.functions.closeChannel(
          channelId,
          action.meta.partner,
          HashZero,
          0,
          HashZero,
          SignatureZero,
        ),
      ).pipe(
        tap(tx =>
          console.log(`sent closeChannel tx "${tx.hash}" to "${action.meta.tokenNetwork}"`),
        ),
        mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
        map(({ receipt, tx }) => {
          if (!receipt.status)
            throw new Error(
              `tokenNetwork "${action.meta.tokenNetwork}" closeChannel transaction "${tx.hash}" failed`,
            );
          console.log(`closeChannel tx "${tx.hash}" successfuly mined!`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelClosedAction will be detected and handled by channelMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelCloseFailed action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelCloseFailed(error, action.meta))),
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
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ActionType<typeof channelSettleFailed>> =>
  action$.pipe(
    filter(isActionOf(channelSettle)),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
      const channel: Channel | undefined = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (
        !channel ||
        !(channel.state === ChannelState.settleable || channel.state === ChannelState.settling) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${action.meta.partner}" not found or not in 'settleable' or 'settling' state`,
        );
        return of(channelSettleFailed(error, action.meta));
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
          action.meta.partner,
          Zero,
          Zero,
          HashZero,
        ),
      ).pipe(
        tap(tx =>
          console.log(`sent settleChannel tx "${tx.hash}" to "${action.meta.tokenNetwork}"`),
        ),
        mergeMap(async tx => ({ receipt: await tx.wait(), tx })),
        map(({ receipt, tx }) => {
          if (!receipt.status)
            throw new Error(
              `tokenNetwork "${action.meta.tokenNetwork}" settleChannel transaction "${tx.hash}" failed`,
            );
          console.log(`settleChannel tx "${tx.hash}" successfuly mined!`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelSettledAction will be detected and handled by channelMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelSettleFailed action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelSettleFailed(error, action.meta))),
      );
    }),
  );

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 */
export const channelSettleableEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof channelSettleable>> =>
  action$.pipe(
    filter(isActionOf(newBlock)),
    withLatestFrom(state$),
    mergeMap(function*([
      {
        payload: { blockNumber },
      },
      state,
    ]) {
      for (const tokenNetwork in state.channels) {
        for (const partner in state.channels[tokenNetwork]) {
          const channel = state.channels[tokenNetwork][partner];
          if (
            channel.state === ChannelState.closed &&
            channel.settleTimeout && // closed channels always have settleTimeout & closeBlock set
            channel.closeBlock &&
            blockNumber > channel.closeBlock + channel.settleTimeout
          ) {
            yield channelSettleable(
              { settleableBlock: blockNumber },
              { tokenNetwork: tokenNetwork as Address, partner: partner as Address },
            );
          }
        }
      }
    }),
  );
