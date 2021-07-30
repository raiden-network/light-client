import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import type { Event } from '@ethersproject/contracts';
import isEmpty from 'lodash/isEmpty';
import sortBy from 'lodash/sortBy';
import type { Observable } from 'rxjs';
import { AsyncSubject, EMPTY, from, merge, timer } from 'rxjs';
import {
  delayWhen,
  distinct,
  exhaustMap,
  filter,
  finalize,
  first,
  map,
  mergeMap,
  pluck,
  publishReplay,
  take,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { raidenShutdown } from '../../actions';
import { ShutdownReason } from '../../constants';
import type { TokenNetwork } from '../../contracts';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { assert, matchError, networkErrors } from '../../utils/error';
import type { ContractFilter, EventTuple } from '../../utils/ethers';
import { fromEthersEvent, getLogsByChunk$, logToContractEvent } from '../../utils/ethers';
import { completeWith, pluckDistinct } from '../../utils/rx';
import type { Address, Hash, UInt } from '../../utils/types';
import { isntNil, last } from '../../utils/types';
import {
  channelClose,
  channelDeposit,
  channelMonitored,
  channelOpen,
  channelSettle,
  channelWithdrawn,
  newBlock,
  tokenMonitored,
} from '../actions';
import { channelKey, channelUniqueKey, groupChannel$ } from '../utils';

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
  const { openTopic, depositTopic, withdrawTopic, closedTopic, settledTopic } =
    getChannelEventsTopics(tokenNetworkContract);
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
