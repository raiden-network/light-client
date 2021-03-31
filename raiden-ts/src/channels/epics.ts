import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { concat as concatBytes } from '@ethersproject/bytes';
import { Zero } from '@ethersproject/constants';
import type { Event } from '@ethersproject/contracts';
import constant from 'lodash/constant';
import findKey from 'lodash/findKey';
import isEmpty from 'lodash/isEmpty';
import sortBy from 'lodash/sortBy';
import type { Observable } from 'rxjs';
import {
  AsyncSubject,
  combineLatest,
  concat,
  defer,
  EMPTY,
  from,
  merge,
  of,
  throwError,
  timer,
} from 'rxjs';
import {
  catchError,
  concatMap,
  debounceTime,
  delayWhen,
  distinct,
  distinctUntilChanged,
  endWith,
  exhaustMap,
  filter,
  finalize,
  first,
  groupBy,
  ignoreElements,
  map,
  mapTo,
  mergeMap,
  mergeMapTo,
  pluck,
  publishReplay,
  scan,
  startWith,
  switchMap,
  take,
  takeUntil,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';

import type { ConfirmableAction, RaidenAction } from '../actions';
import { raidenShutdown, raidenSynced } from '../actions';
import { intervalFromConfig } from '../config';
import { ShutdownReason } from '../constants';
import type { HumanStandardToken, TokenNetwork } from '../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../helpers';
import { createBalanceHash, MessageTypeId } from '../messages/utils';
import type { RaidenState } from '../state';
import { Direction } from '../transfers/state';
import { findBalanceProofMatchingBalanceHash$ } from '../transfers/utils';
import type { RaidenEpicDeps } from '../types';
import { isActionOf } from '../utils/actions';
import { encode } from '../utils/data';
import {
  assert,
  commonAndFailTxErrors,
  ErrorCodes,
  matchError,
  networkErrors,
  RaidenError,
} from '../utils/error';
import type { ContractFilter, EventTuple } from '../utils/ethers';
import { fromEthersEvent, getLogsByChunk$, logToContractEvent } from '../utils/ethers';
import {
  completeWith,
  lastMap,
  pluckDistinct,
  retryAsync$,
  retryWhile,
  takeIf,
} from '../utils/rx';
import type { Address, Hash, HexString, Signature, UInt } from '../utils/types';
import { isntNil, last } from '../utils/types';
import {
  blockStale,
  blockTime,
  channelClose,
  channelDeposit,
  channelMonitored,
  channelOpen,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
  newBlock,
  tokenMonitored,
} from './actions';
import type { Channel } from './state';
import { ChannelState } from './state';
import { approveIfNeeded$, assertTx, channelKey, channelUniqueKey, groupChannel$ } from './utils';

/**
 * Emits raidenSynced when all init$ tasks got completed
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.init$ - Init$ subject
 * @returns Observable of raidenSynced actions
 */
export function initEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { init$ }: RaidenEpicDeps,
): Observable<raidenSynced> {
  return state$.pipe(
    first(),
    mergeMap(({ blockNumber: initialBlock }) => {
      const startTime = Date.now();
      return init$.pipe(
        mergeMap((subject) => concat(of(1), subject.pipe(ignoreElements(), endWith(-1)))),
        scan((acc, v) => acc + v, 0), // scan doesn't emit initial value
        debounceTime(10), // should be just enough for some sync action
        first((acc) => acc === 0),
        withLatestFrom(state$),
        map(([, { blockNumber }]) =>
          raidenSynced({
            tookMs: Date.now() - startTime,
            initialBlock,
            currentBlock: blockNumber,
          }),
        ),
      );
    }),
    completeWith(state$),
    finalize(() => init$.complete()),
  );
}

/**
 * Fetch current blockNumber, register for new block events and emit newBlock actions
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.provider - Eth provider
 * @param deps.init$ - Observable which completes when initial sync is done
 * @returns Observable of newBlock actions
 */
export function initNewBlockEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { provider, init$ }: RaidenEpicDeps,
): Observable<newBlock> {
  return retryAsync$(() => provider.getBlockNumber(), provider.pollingInterval).pipe(
    // emits fetched block first, then subscribes to provider's block after synced
    mergeMap((blockNumber) =>
      init$.pipe(
        lastMap(() => fromEthersEvent<number>(provider, 'block')),
        startWith(blockNumber),
      ),
    ),
    map((blockNumber) => newBlock({ blockNumber })),
    completeWith(action$),
  );
}

/**
 * Every fetchEach=20 blocks, update average block time since previous request
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.provider - Eth provider
 * @returns Observable of blockTime actions
 */
export function blockTimeEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<blockTime> {
  const fetchEach = 20;
  type BlockInfo = readonly [blockNumber: number, timestamp: number, blockTime?: number];
  let lastInfo: BlockInfo = [-fetchEach, 0]; // previously fetched block info

  // get block info for a given block number
  const getBlockInfo$ = (blockNumber: number) =>
    defer(async () =>
      provider
        .getBlock(blockNumber)
        .then(({ timestamp }): BlockInfo => [blockNumber, timestamp * 1000]),
    );

  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    filter((blockNumber) => blockNumber >= lastInfo[0] + fetchEach),
    exhaustMap((blockNumber) => {
      const prevInfo$ =
        lastInfo[0] > 0 ? of(lastInfo) : getBlockInfo$(Math.max(1, blockNumber - fetchEach));
      const curInfo$ = getBlockInfo$(blockNumber);
      return combineLatest([prevInfo$, curInfo$]).pipe(
        mergeMap(function* ([prevInfo, curInfo]) {
          const avgBlockTime = (curInfo[1] - prevInfo[1]) / (curInfo[0] - prevInfo[0]);
          // emit a new avg blockTime only if it changed
          if (avgBlockTime !== lastInfo[2]) yield avgBlockTime;
          lastInfo = [curInfo[0], curInfo[1], avgBlockTime]; // persist last BlockInfo
        }),
        catchError(constant(EMPTY)), // ignore errors to retry next block
      );
    }),
    map((avgBlockTime) => blockTime({ blockTime: avgBlockTime })),
  );
}

/**
 * Monitors provider for staleness. A provider is considered stale when it doesn't emit new blocks
 * on either 2 * httpTimeout or the average time for 3 blocks.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of blockStale actions
 */
export function blockStaleEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
) {
  return state$.pipe(
    pluckDistinct('blockNumber'),
    withLatestFrom(latest$, config$),
    // forEach block
    map(([, { blockTime }, { httpTimeout }]) => Math.max(3 * blockTime, 2 * httpTimeout)),
    // switchMap will "reset" timer every block, restarting the timeout
    switchMap((staleTimeout) =>
      concat(
        of(false),
        timer(staleTimeout).pipe(
          mapTo(true),
          // ensure timer completes output if input completes,
          // but first element of concat ensures it'll emit at least once (true) when subscribed
          completeWith(state$),
        ),
      ),
    ),
    distinctUntilChanged(),
    map((stale) => blockStale({ stale })),
  );
}

function scanRegistryTokenNetworks({
  address,
  provider,
  registryContract,
  contractsInfo,
  getTokenNetworkContract,
}: RaidenEpicDeps): Observable<tokenMonitored> {
  const encodedAddress = defaultAbiCoder.encode(['address'], [address]);
  return getLogsByChunk$(
    provider,
    Object.assign(registryContract.filters.TokenNetworkCreated(null, null), {
      fromBlock: contractsInfo.TokenNetworkRegistry.block_number,
      toBlock: provider.blockNumber,
    }),
  ).pipe(
    map(logToContractEvent(registryContract)),
    filter(([, tokenNetwork]) => !!tokenNetwork),
    toArray(),
    mergeMap((logs) => {
      const alwaysMonitored$: Observable<tokenMonitored> = from(
        logs.splice(0, 2).map(([token, tokenNetwork, event]) =>
          tokenMonitored({
            token: token as Address,
            tokenNetwork: tokenNetwork as Address,
            fromBlock: event.blockNumber,
          }),
        ),
      );

      let monitorsIfHasChannels$: Observable<tokenMonitored> = EMPTY;
      if (logs.length) {
        const firstBlock = logs[0][2].blockNumber;
        const tokenNetworks = new Map<string, [token: Address, event: Event]>(
          logs.map(([token, tokenNetwork, event]) => [tokenNetwork, [token as Address, event]]),
        );
        const allTokenNetworkAddrs = Array.from(tokenNetworks.keys());
        const aTokenNetworkContract = getTokenNetworkContract(allTokenNetworkAddrs[0] as Address);
        const { openTopic } = getChannelEventsTopics(aTokenNetworkContract);
        // simultaneously query all tokenNetworks for channels from us and to us
        monitorsIfHasChannels$ = merge(
          getLogsByChunk$(provider, {
            address: allTokenNetworkAddrs,
            topics: [openTopic, null, encodedAddress], // channels from us
            fromBlock: firstBlock,
            toBlock: provider.blockNumber,
          }),
          getLogsByChunk$(provider, {
            address: allTokenNetworkAddrs,
            topics: [openTopic, null, null, encodedAddress], // channels to us
            fromBlock: firstBlock,
            toBlock: provider.blockNumber,
          }),
        ).pipe(
          distinct((log) => log.address), // only act on the first log found for each tokenNetwork
          filter((log) => tokenNetworks.has(log.address)), // shouldn't fail
          map((log) =>
            tokenMonitored({
              token: tokenNetworks.get(log.address)![0],
              tokenNetwork: log.address as Address,
              fromBlock: log.blockNumber,
            }),
          ),
        );
      }

      return merge(alwaysMonitored$, monitorsIfHasChannels$);
    }),
  );
}

/**
 * If state.tokens is empty (usually only on first run), scan registry and token networks for
 * registered TokenNetworks of interest (ones which has/had channels with us) and monitors them.
 * Otherwise, just emit tokenMonitored actions for all previously monitored TokenNetworks
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.provider - Eth provider
 * @param deps.registryContract - TokenNetworkRegistry contract instance
 * @param deps.contractsInfo - Contracts info mapping
 * @param deps.init$ - Init$ tasks subject
 * @returns Observable of tokenMonitored actions
 */
export function initTokensRegistryEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<tokenMonitored> {
  return action$.pipe(
    filter(newBlock.is),
    take(1),
    withLatestFrom(state$),
    mergeMap(([, state]) => {
      const initSub = new AsyncSubject<null>();
      deps.init$.next(initSub);

      let monitored$: Observable<tokenMonitored>;

      if (isEmpty(state.tokens)) monitored$ = scanRegistryTokenNetworks(deps);
      else
        monitored$ = from(
          Object.entries(state.tokens).map(([token, tokenNetwork]) =>
            tokenMonitored({ token: token as Address, tokenNetwork }),
          ),
        );

      return monitored$.pipe(finalize(() => initSub.complete()));
    }),
  );
}

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.network - Current network
 * @param deps.provider - Eth provider
 * @param deps.main - Main account
 * @returns Observable of raidenShutdown actions
 */
export function initMonitorProviderEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, main, network, provider }: RaidenEpicDeps,
): Observable<raidenShutdown> {
  const mainAddress = main?.address ?? address;
  let isProviderAccount: boolean | undefined;
  return timer(0, provider.pollingInterval).pipe(
    completeWith(action$),
    exhaustMap(async () => {
      try {
        const [accounts, currentNetwork] = await Promise.all([
          isProviderAccount === false ? Promise.resolve(null) : provider.listAccounts(),
          provider.getNetwork(),
        ]);
        // usually, getNetwork will reject if 'underlying network changed', but let's assert here
        // as well against our state's network to be double-sure
        assert(currentNetwork.chainId === network.chainId, 'network changed');

        // at init time, check if our address is in provider's accounts list;
        // if not, it means Signer is a local Wallet or another non-provider-side account
        if (isProviderAccount === undefined) isProviderAccount = accounts?.includes(mainAddress);

        if (isProviderAccount && accounts && !accounts.includes(mainAddress))
          return raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED });
      } catch (error) {
        if (error?.message?.includes('network changed'))
          return raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED });
        // ignore network errors, so they're retried by timer
        if (matchError(networkErrors, error)) return;
        throw error;
      }
    }),
    filter(isntNil),
  );
}

// type of elements mapped from contract-emitted events/logs
type ChannelEventsNames =
  | 'ChannelOpened'
  | 'ChannelNewDeposit'
  | 'ChannelWithdraw'
  | 'ChannelClosed'
  | 'ChannelSettled';
type ChannelEvents<E extends keyof TokenNetwork['filters'] = ChannelEventsNames> = EventTuple<
  ContractFilter<TokenNetwork, E>
>;
type ChannelOpenedEvent = ChannelEvents<'ChannelOpened'>;
type ChannelNewDepositEvent = ChannelEvents<'ChannelNewDeposit'>;
type ChannelWithdrawEvent = ChannelEvents<'ChannelWithdraw'>;
type ChannelClosedEvent = ChannelEvents<'ChannelClosed'>;

function getChannelEventsTopics(tokenNetworkContract: TokenNetwork) {
  return {
    openTopic: Interface.getEventTopic(tokenNetworkContract.interface.getEvent('ChannelOpened')),
    depositTopic: Interface.getEventTopic(
      tokenNetworkContract.interface.getEvent('ChannelNewDeposit'),
    ),
    withdrawTopic: Interface.getEventTopic(
      tokenNetworkContract.interface.getEvent('ChannelWithdraw'),
    ),
    closedTopic: Interface.getEventTopic(tokenNetworkContract.interface.getEvent('ChannelClosed')),
    settledTopic: Interface.getEventTopic(
      tokenNetworkContract.interface.getEvent('ChannelSettled'),
    ),
  };
}

function mapChannelEventsToAction(
  [token, tokenNetwork]: [Address, Address],
  { address, latest$, getTokenNetworkContract }: RaidenEpicDeps,
) {
  const tokenNetworkContract = getTokenNetworkContract(tokenNetwork);
  const {
    openTopic,
    depositTopic,
    withdrawTopic,
    closedTopic,
    settledTopic,
  } = getChannelEventsTopics(tokenNetworkContract);
  return (input$: Observable<ChannelEvents>) =>
    input$.pipe(
      withLatestFrom(latest$),
      map(([args, { state, config }]) => {
        const id = args[0].toNumber();
        // if it's undefined, this channel is unknown/not with us, and should be filtered out
        const channel = Object.values(state.channels).find(
          (c) => c.tokenNetwork === tokenNetwork && c.id === id,
        );

        const event = last(args);
        const topic = event.topics?.[0];
        const txHash = event.transactionHash! as Hash;
        const txBlock = event.blockNumber!;
        const confirmed =
          txBlock + config.confirmationBlocks <= state.blockNumber ? true : undefined;

        let action;
        switch (topic) {
          case openTopic: {
            const [, p1, p2, settleTimeout] = args as ChannelOpenedEvent;
            // filter out open events not with us
            if ((address === p1 || address === p2) && (!channel || id > channel.id)) {
              const partner = (address == p1 ? p2 : p1) as Address;
              action = channelOpen.success(
                {
                  id,
                  token: token as Address,
                  settleTimeout: settleTimeout.toNumber(),
                  isFirstParticipant: address === p1,
                  txHash,
                  txBlock,
                  confirmed,
                },
                { tokenNetwork, partner },
              );
            }
            break;
          }
          case depositTopic: {
            const [, participant, totalDeposit] = args as ChannelNewDepositEvent;
            if (
              channel?.id === id &&
              totalDeposit.gt(
                channel[participant === channel.partner.address ? 'partner' : 'own'].deposit,
              )
            )
              action = channelDeposit.success(
                {
                  id,
                  participant: participant as Address,
                  totalDeposit: totalDeposit as UInt<32>,
                  txHash,
                  txBlock,
                  confirmed,
                },
                { tokenNetwork, partner: channel.partner.address },
              );
            break;
          }
          case withdrawTopic: {
            const [, participant, totalWithdraw] = args as ChannelWithdrawEvent;
            if (
              channel?.id === id &&
              totalWithdraw.gt(
                channel[participant === channel.partner.address ? 'partner' : 'own'].withdraw,
              )
            )
              action = channelWithdrawn(
                {
                  id,
                  participant: participant as Address,
                  totalWithdraw: totalWithdraw as UInt<32>,
                  txHash,
                  txBlock,
                  confirmed,
                },
                { tokenNetwork, partner: channel.partner.address },
              );
            break;
          }
          case closedTopic: {
            if (channel?.id === id && !('closeBlock' in channel)) {
              const [, participant] = args as ChannelClosedEvent;
              action = channelClose.success(
                { id, participant: participant as Address, txHash, txBlock, confirmed },
                { tokenNetwork, partner: channel.partner.address },
              );
            }
            break;
          }
          case settledTopic: {
            // settle may only happen more tha confirmation blocks after opening, so be stricter
            if (channel?.id === id)
              action = channelSettle.success(
                { id, txHash, txBlock, confirmed, locks: channel.partner.locks },
                { tokenNetwork, partner: channel.partner.address },
              );
            break;
          }
        }
        return action; // action isn't any, it gets its type from assignments above
      }),
      filter(isntNil),
    );
}

function fetchPastChannelEvents$(
  [fromBlock, toBlock]: [number, number],
  [token, tokenNetwork]: [Address, Address],
  deps: RaidenEpicDeps,
) {
  const { address, provider, latest$, getTokenNetworkContract } = deps;
  const tokenNetworkContract = getTokenNetworkContract(tokenNetwork);
  const { openTopic } = getChannelEventsTopics(tokenNetworkContract);

  // start by scanning [fromBlock, toBlock] interval for ChannelOpened events limited to or from us
  return merge(
    getLogsByChunk$(
      provider,
      Object.assign(tokenNetworkContract.filters.ChannelOpened(null, address, null, null), {
        fromBlock,
        toBlock,
      }),
    ),
    getLogsByChunk$(
      provider,
      Object.assign(tokenNetworkContract.filters.ChannelOpened(null, null, address, null), {
        fromBlock,
        toBlock,
      }),
    ),
  ).pipe(
    map(logToContractEvent(tokenNetworkContract)),
    toArray(),
    withLatestFrom(latest$),
    mergeMap(([logs, { state }]) => {
      // map Log to ContractEvent and filter out channels which we know are already gone
      const openEvents = logs.filter(([_id, p1, p2]) => {
        const partner = (address === p1 ? p2 : p1) as Address;
        const id = _id.toNumber();
        const key = channelKey({ tokenNetwork, partner });
        // filter out settled or old channels, no new event could come from it
        return !(
          channelUniqueKey({ id, tokenNetwork, partner }) in state.oldChannels ||
          (key in state.channels && id < state.channels[key].id)
        );
      });
      const channelIds = [
        ...openEvents, // use new past openEvents ids
        ...Object.values(state.channels)
          .filter((c) => c.tokenNetwork === tokenNetwork)
          .map((c) => [c.id]), // use previous confirmed channels ids
      ].map(([id]) => defaultAbiCoder.encode(['uint256'], [id]));
      if (channelIds.length === 0) return EMPTY;

      // get all events of interest in the block range for all channelIds from open events above
      const allButOpenedFilter = {
        address: tokenNetwork,
        topics: [
          // events of interest as topics[0], without open events (already fetched above)
          Object.values(getChannelEventsTopics(tokenNetworkContract)).filter(
            (topic) => topic !== openTopic,
          ),
          channelIds, // ORed channelIds set as topics[1]=channelId
        ],
      } as ContractFilter<TokenNetwork, Exclude<ChannelEventsNames, 'ChannelOpened'>>;
      return getLogsByChunk$(
        provider,
        Object.assign(allButOpenedFilter, { fromBlock, toBlock }),
      ).pipe(
        map(logToContractEvent(tokenNetworkContract)),
        toArray(),
        // synchronously sort/interleave open|(deposit|withdraw|close|settle) events, and unwind
        mergeMap((logs) => {
          const allEvents = [...openEvents, ...logs];
          return from(
            sortBy(allEvents, [
              (args) => last(args).blockNumber,
              (args) => last(args).transactionIndex,
            ]),
          );
        }),
      );
    }),
    mapChannelEventsToAction([token, tokenNetwork], deps),
  );
}

function fetchNewChannelEvents$(
  fromBlock: number,
  [token, tokenNetwork]: [Address, Address],
  deps: RaidenEpicDeps,
) {
  const { provider, getTokenNetworkContract, config$, latest$ } = deps;
  const tokenNetworkContract = getTokenNetworkContract(tokenNetwork);
  const blockNumber$ = latest$.pipe(pluckDistinct('state', 'blockNumber'));

  // this mapping is needed to handle channel events emitted before open is confirmed/stored
  const channelFilter = {
    address: tokenNetwork,
    // set only topics[0], to get also open events (new ids); filter client-side
    topics: [Object.values(getChannelEventsTopics(tokenNetworkContract))],
  } as ContractFilter<TokenNetwork, ChannelEventsNames>;
  return fromEthersEvent(provider, channelFilter, {
    fromBlock,
    blockNumber$,
    confirmations: config$.pipe(pluck('confirmationBlocks')),
  }).pipe(
    map(logToContractEvent(tokenNetworkContract)),
    mapChannelEventsToAction([token, tokenNetwork], deps),
  );
}

/**
 * Listen TokenNetwork contract for channel Events
 * Currently monitored events:
 * - ChannelOpened, fires a channelopen.success action
 * - ChannelNewDeposit, fires a channelDeposit.success action
 * - ChannelWithdraw, fires a channelWithdrawn action
 * - ChannelClosedEvent, fires a channelClose.success action
 * - ChannelSettledEvent, fires a channelSettle.success action
 * Also emits tokenMonitored to tell we're monitoring a tokenNetwork, with its [fromBlock, toBlock]
 * ranges of fetched pastEvents
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @returns Observable of channelOpen.success,channelDeposit.success,channelClose.success,
 *      channelSettle.success actions
 */
export function channelEventsEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  | tokenMonitored
  | channelOpen.success
  | channelDeposit.success
  | channelWithdrawn
  | channelClose.success
  | channelSettle.success
> {
  const resetEventsBlock: number = deps.provider._lastBlockNumber;
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    publishReplay(1, undefined, (blockNumber$) =>
      action$.pipe(
        filter(tokenMonitored.is),
        distinct((action) => action.payload.tokenNetwork),
        withLatestFrom(deps.config$),
        mergeMap(([action, { confirmationBlocks }]) => {
          const { token, tokenNetwork } = action.payload;
          // fromBlock is latest on-chain event seen for this contract, or registry deployment block +1
          const fromBlock = action.payload.fromBlock ?? resetEventsBlock - confirmationBlocks;

          // notifies when past events fetching completes
          const pastDone$ = new AsyncSubject<true>();
          deps.init$.next(pastDone$);

          // blockNumber$ holds latest blockNumber, or waits for it to be fetched
          return blockNumber$.pipe(
            first(),
            mergeMap((toBlock) =>
              // this merge + finalize + delayWhen AsyncSubject outputs like concat, but ensures
              // both subscriptions are done simultaneously, to avoid losing monitored new events
              // or that they'd come before any pastEvent
              merge(
                fetchPastChannelEvents$([fromBlock, toBlock], [token, tokenNetwork], deps).pipe(
                  finalize(() => {
                    pastDone$.next(true);
                    pastDone$.complete();
                  }),
                ),
                fetchNewChannelEvents$(toBlock + 1, [token, tokenNetwork], deps).pipe(
                  delayWhen(() => pastDone$), // holds new events until pastEvents fetching ends
                ),
              ),
            ),
          );
        }),
      ),
    ),
    completeWith(action$),
  );
}

/**
 * Emit channelMonitored action for channels on state
 *
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelMonitored actions
 */
export function channelMonitoredEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelMonitored> {
  return state$.pipe(
    groupChannel$,
    mergeMap((grouped$) =>
      grouped$.pipe(
        first(),
        map((channel) =>
          channelMonitored(
            { id: channel.id },
            { tokenNetwork: channel.tokenNetwork, partner: channel.partner.address },
          ),
        ),
      ),
    ),
  );
}

/**
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as channelOpen.success action
 * will instead be detected and fired by channelEventsEpic. If anything detectable goes wrong,
 * fires a channelOpen.failure action instead
 *
 * @param action$ - Observable of channelOpen actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Observable of channelOpen.failure actions
 */
export function channelOpenEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, provider, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelOpen.failure | channelDeposit.request> {
  return action$.pipe(
    filter(isActionOf(channelOpen.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { settleTimeout, subkey: configSubkey }]) => {
      const { tokenNetwork, partner } = action.meta;
      const channelState = state.channels[channelKey(action.meta)]?.state;
      // fails if channel already exist
      if (channelState)
        return of(
          channelOpen.failure(
            new RaidenError(ErrorCodes.CNL_INVALID_STATE, { state: channelState }),
            action.meta,
          ),
        );
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );

      let deposit$: Observable<channelDeposit.request> = EMPTY;
      if (action.payload.deposit?.gt(0))
        // if it didn't fail so far, emit a channelDeposit.request in parallel with waitOpen=true
        // to send 'approve' tx meanwhile we open the channel
        deposit$ = of(
          channelDeposit.request(
            { deposit: action.payload.deposit, subkey: action.payload.subkey, waitOpen: true },
            action.meta,
          ),
        );

      return concat(
        deposit$,
        defer(() =>
          tokenNetworkContract.openChannel(
            address,
            partner,
            action.payload.settleTimeout ?? settleTimeout,
          ),
        ).pipe(
          assertTx('openChannel', ErrorCodes.CNL_OPENCHANNEL_FAILED, { log, provider }),
          // also retry txFailErrors: if it's caused by partner having opened, takeUntil will see
          retryWhile(intervalFromConfig(config$), {
            onErrors: commonAndFailTxErrors,
            log: log.info,
          }),
          // if channel gets opened while retrying (e.g. by partner), give up to avoid erroring
          takeUntil(
            action$.pipe(
              filter(channelOpen.success.is),
              filter(
                (action_) =>
                  action_.meta.tokenNetwork === tokenNetwork && action_.meta.partner === partner,
              ),
            ),
          ),
          // ignore success so it's picked by channelEventsEpic
          ignoreElements(),
          catchError((error) => of(channelOpen.failure(error, action.meta))),
        ),
      );
    }),
  );
}

function makeDeposit$(
  [tokenContract, tokenNetworkContract]: [HumanStandardToken, TokenNetwork],
  [sender, address, partner]: [Address, Address, Address],
  deposit: UInt<32>,
  channelId$: Observable<number>,
  { log, provider, config$ }: Pick<RaidenEpicDeps, 'log' | 'provider' | 'config$'>,
) {
  // retryWhile from here
  return defer(() =>
    Promise.all([
      tokenContract.callStatic.balanceOf(sender) as Promise<UInt<32>>,
      tokenContract.callStatic.allowance(sender, tokenNetworkContract.address) as Promise<
        UInt<32>
      >,
    ]),
  ).pipe(
    withLatestFrom(config$),
    mergeMap(([[balance, allowance], { minimumAllowance }]) =>
      approveIfNeeded$(
        [balance, allowance, deposit],
        tokenContract,
        tokenNetworkContract.address as Address,
        ErrorCodes.CNL_APPROVE_TRANSACTION_FAILED,
        { provider },
        { log, minimumAllowance },
      ),
    ),
    mergeMapTo(channelId$),
    take(1),
    // get current 'view' of own/'address' deposit, despite any other pending deposits
    mergeMap(async (id) =>
      tokenNetworkContract.callStatic
        .getChannelParticipantInfo(id, address, partner)
        .then(({ 0: totalDeposit }) => [id, totalDeposit] as const),
    ),
    // send setTotalDeposit transaction
    mergeMap(async ([id, totalDeposit]) =>
      tokenNetworkContract.setTotalDeposit(id, address, totalDeposit.add(deposit), partner),
    ),
    assertTx('setTotalDeposit', ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED, { log, provider }),
    // retry also txFail errors, since estimateGas can lag behind just-opened channel or
    // just-approved allowance
    retryWhile(intervalFromConfig(config$), { onErrors: commonAndFailTxErrors, log: log.info }),
  );
}

/**
 * A channelDeposit action requested by user or by channelOpenEpic
 * Needs to be called on a previously monitored channel. Calls Token.approve for TokenNetwork
 * and then set respective setTotalDeposit. If all tx go through successfuly, stop as
 * channelDeposit.success action will instead be detected and reacted by channelEventsEpic.
 * If anything detectable goes wrong, fires channelDeposit.failure instead
 * Fails immediately if channel doesn't exist or isn't open, unless payload.waitOpen is true, in
 * which case 'approve' in paralle and wait for confirmed channelOpen.success to 'setTotalDeposit'
 *
 * @param action$ - Observable of channelDeposit.request|channelOpen.failure actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.getTokenContract - Token contract instance getter
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.provider - Eth provider
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of channelDeposit.failure actions
 */
export function channelDepositEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    getTokenContract,
    getTokenNetworkContract,
    provider,
    config$,
    latest$,
  }: RaidenEpicDeps,
): Observable<channelDeposit.failure> {
  return action$.pipe(
    filter(isActionOf(channelDeposit.request)),
    groupBy((action) => action.meta.tokenNetwork),
    mergeMap((grouped$) =>
      grouped$.pipe(
        // groupBy + concatMap ensure actions handling is serialized in a given tokenNetwork
        concatMap((action) =>
          combineLatest([latest$, config$]).pipe(
            first(),
            mergeMap(([{ state }, { subkey: configSubkey }]) => {
              assert(action.payload.deposit.gt(0), ErrorCodes.DTA_INVALID_DEPOSIT);
              const { tokenNetwork, partner } = action.meta;

              const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
              const channel = state.channels[channelKey(action.meta)];
              let channel$;
              if (token && !channel && action.payload.waitOpen)
                channel$ = merge(
                  // throw if channelOpen.failure goes through
                  action$.pipe(
                    filter(channelOpen.failure.is),
                    filter(
                      (failure) =>
                        failure.meta.tokenNetwork === action.meta.tokenNetwork &&
                        failure.meta.partner === action.meta.partner,
                    ),
                    mergeMapTo(
                      throwError(
                        new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, action.meta),
                      ),
                    ),
                  ),
                  // wait for channel to become available
                  latest$.pipe(
                    pluck('state', 'channels', channelKey(action.meta)),
                    filter(isntNil),
                  ),
                );
              else if (channel?.state === ChannelState.open) channel$ = of(channel);
              else throw new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND);

              const { signer: onchainSigner, address: onchainAddress } = chooseOnchainAccount(
                { signer, address, main },
                action.payload.subkey ?? configSubkey,
              );
              const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
              const tokenNetworkContract = getContractWithSigner(
                getTokenNetworkContract(tokenNetwork),
                onchainSigner,
              );

              return channel$.pipe(
                pluck('id'),
                // 'cache' channelId$ (if needed) while waiting for 'approve';
                // also, subscribe early to error if seeing channelOpen.failure
                publishReplay(1, undefined, (channelId$) =>
                  // already start 'approve' even while waiting for 'channel$'
                  makeDeposit$(
                    [tokenContract, tokenNetworkContract],
                    [onchainAddress, address, partner],
                    action.payload.deposit,
                    channelId$,
                    { log, provider, config$ },
                  ),
                ),
                // ignore success tx so it's picked by channelEventsEpic
                ignoreElements(),
              );
            }),
            catchError((error) => of(channelDeposit.failure(error, action.meta))),
          ),
        ),
      ),
    ),
  );
}

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
  }: RaidenEpicDeps,
): Observable<channelClose.failure> {
  return action$.pipe(
    filter(isActionOf(channelClose.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
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
  }: RaidenEpicDeps,
): Observable<never> {
  return action$.pipe(
    filter(isActionOf(channelClose.success)),
    filter((action) => !!action.payload.confirmed),
    // wait a newBlock go through after channelClose confirmation, to ensure any pending
    // channelSettle could have been processed
    delayWhen(() => action$.pipe(filter(newBlock.is))),
    withLatestFrom(state$, config$),
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
    mergeMap(([action, state, { subkey }]) => {
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

/**
 * If config.autoSettle is true, calls channelSettle.request on settleable channels
 * The event is emitted between [confirmationBlocks, 2 * confirmationBlocks] after channel becomes
 * settleable, to give time for confirmation and for partner to settle.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @returns Observable of channelSettle.request actions
 */
export function channelAutoSettleEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<channelSettle.request> {
  return state$.pipe(
    groupChannel$,
    mergeMap((grouped$) =>
      grouped$.pipe(
        filter(
          (channel): channel is Channel & { state: ChannelState.settleable } =>
            channel.state === ChannelState.settleable,
        ),
        take(1),
        withLatestFrom(config$),
        // wait [confirmationBlocks, 2 * confirmationBlocks] before proceeding
        delayWhen(([channel, { confirmationBlocks }]) => {
          const settleBlock =
            channel.closeBlock +
            channel.settleTimeout +
            Math.round(confirmationBlocks * (1.0 + Math.random()));
          return state$.pipe(
            pluck('blockNumber'),
            filter((blockNumber) => settleBlock <= blockNumber),
            take(1),
          );
        }),
        withLatestFrom(state$),
        // filter channel isn't yet being settled by us or partner (state=settling)
        filter(
          ([[channel], state]) =>
            state.channels[channelKey(channel)]?.state === ChannelState.settleable,
        ),
        map(([[channel]]) =>
          channelSettle.request(undefined, {
            tokenNetwork: channel.tokenNetwork,
            partner: channel.partner.address,
          }),
        ),
      ),
    ),
    takeIf(config$.pipe(pluck('autoSettle'), completeWith(state$))),
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
 * @param deps.db - Database instance
 * @returns Observable of channelSettle.failure actions
 */
export function channelSettleEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, provider, getTokenNetworkContract, config$, db }: RaidenEpicDeps,
): Observable<channelSettle.failure> {
  return action$.pipe(
    filter(isActionOf(channelSettle.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
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
      const settleableStates = [ChannelState.settleable, ChannelState.settling];
      if (!settleableStates.includes(channel?.state)) {
        const error = new RaidenError(
          ErrorCodes.CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND,
          action.meta,
        );
        return of(channelSettle.failure(error, action.meta));
      }

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
              catchError(() =>
                throwError(
                  new RaidenError(ErrorCodes.CNL_SETTLE_INVALID_BALANCEHASH, {
                    address,
                    ownBalanceHash: ownBH,
                  }),
                ),
              ),
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
              catchError(() =>
                throwError(
                  new RaidenError(ErrorCodes.CNL_SETTLE_INVALID_BALANCEHASH, {
                    address,
                    partnerBalanceHash: partnerBH,
                  }),
                ),
              ),
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
            mergeMap(([part1, part2]) =>
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
                ),
              ).pipe(
                assertTx('settleChannel', ErrorCodes.CNL_SETTLE_FAILED, { log, provider }),
                retryWhile(intervalFromConfig(config$), {
                  onErrors: commonAndFailTxErrors,
                  log: log.info,
                }),
                // if channel gets settled while retrying (e.g. by partner), give up
                takeUntil(
                  action$.pipe(
                    filter(channelSettle.success.is),
                    filter(
                      (action) =>
                        action.meta.tokenNetwork === tokenNetwork &&
                        action.meta.partner === partner,
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
    }),
  );
}

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
 * @returns Empty observable
 */
export function channelUnlockEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, provider, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelSettle.failure> {
  return action$.pipe(
    filter(isActionOf(channelSettle.success)),
    filter((action) => !!(action.payload.confirmed && action.payload.locks?.length)),
    withLatestFrom(state$, config$),
    // ensure there's no channel, or if yes, it's a different (by channelId)
    filter(([action, state]) => state.channels[channelKey(action.meta)]?.id !== action.payload.id),
    mergeMap(([action, , { subkey }]) => {
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
        tokenNetworkContract.unlock(action.payload.id, address, partner, locks),
      ).pipe(
        assertTx('unlock', ErrorCodes.CNL_ONCHAIN_UNLOCK_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), {
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

function checkPendingAction(
  action: ConfirmableAction,
  provider: RaidenEpicDeps['provider'],
  blockNumber: number,
  confirmationBlocks: number,
): Observable<RaidenAction> {
  return retryAsync$(
    () => provider.getTransactionReceipt(action.payload.txHash),
    provider.pollingInterval,
  ).pipe(
    map((receipt) => {
      if (
        receipt?.confirmations !== undefined &&
        receipt.confirmations >= confirmationBlocks &&
        receipt.status // reorgs can make txs fail
      ) {
        return {
          ...action,
          // beyond setting confirmed, also re-set blockNumber,
          // which may have changed on a reorg
          payload: {
            ...action.payload,
            txBlock: receipt.blockNumber ?? action.payload.txBlock,
            confirmed: true,
          },
        } as RaidenAction;
      } else if (action.payload.txBlock + 2 * confirmationBlocks < blockNumber) {
        // if this txs didn't get confirmed for more than 2*confirmationBlocks, it was removed
        return {
          ...action,
          payload: { ...action.payload, confirmed: false },
        } as RaidenAction;
      } // else, it seems removed, but give it twice confirmationBlocks to be picked up again
    }),
    filter(isntNil),
  );
}

/**
 * Process new blocks and re-emit confirmed or removed actions
 *
 * Events can also be confirmed by `fromEthersEvent + map(logToContractEvent)` combination.
 * Notice that this epic does not know how to parse a tx log to update an action which payload was
 * composed of values which can change upon reorgs. It only checks if given txHash is still present
 * on the blockchain. `fromEthersEvent` can usually emit unconfirmed events multiple times to
 * update/replace the pendingTxs action if needed, and also should emit the confirmed action with
 * proper values; therefore, one should only relay on this epic to confirm an action if there's
 * nothing critical depending on values in it's payload which can change upon reorgs.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @param deps.latest$ - Latest observable
 * @returns Observable of confirmed or removed actions
 */
export function confirmationEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, provider, latest$ }: RaidenEpicDeps,
): Observable<RaidenAction> {
  return combineLatest([
    state$.pipe(pluckDistinct('blockNumber')),
    state$.pipe(pluck('pendingTxs')),
    config$.pipe(pluckDistinct('confirmationBlocks'), completeWith(state$)),
  ]).pipe(
    filter(([, pendingTxs]) => pendingTxs.length > 0),
    // exhaust will ignore blocks while concat$ is busy
    exhaustMap(([blockNumber, pendingTxs, confirmationBlocks]) =>
      from(pendingTxs).pipe(
        // only txs/confirmable actions which are more than confirmationBlocks in the past
        filter((a) => a.payload.txBlock + confirmationBlocks < blockNumber),
        concatMap((action) =>
          checkPendingAction(action, provider, blockNumber, confirmationBlocks).pipe(
            // unsubscribe if it gets cleared from 'pendingTxs' while checking, to avoid duplicate
            takeUntil(
              latest$.pipe(
                filter(
                  ({ state }) =>
                    !state.pendingTxs.some(
                      (a) => a.type === action.type && a.payload.txHash === action.payload.txHash,
                    ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
