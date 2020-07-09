import {
  Observable,
  from,
  of,
  EMPTY,
  merge,
  interval,
  defer,
  concat as concat$,
  combineLatest,
  timer,
  throwError,
  AsyncSubject,
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  withLatestFrom,
  exhaustMap,
  take,
  mapTo,
  pluck,
  publishReplay,
  ignoreElements,
  skip,
  retryWhen,
  mergeMapTo,
  first,
  delayWhen,
  finalize,
} from 'rxjs/operators';
import findKey from 'lodash/findKey';
import sortBy from 'lodash/sortBy';
import isEmpty from 'lodash/isEmpty';

import { BigNumber, concat, defaultAbiCoder } from 'ethers/utils';
import { Event } from 'ethers/contract';
import { Zero } from 'ethers/constants';
import { Filter, Log, JsonRpcProvider } from 'ethers/providers';

import { RaidenEpicDeps } from '../types';
import { RaidenAction, raidenShutdown, ConfirmableAction } from '../actions';
import { RaidenState } from '../state';
import { ShutdownReason } from '../constants';
import { chooseOnchainAccount, getContractWithSigner } from '../helpers';
import { Address, Hash, UInt, Signature, isntNil, HexString } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { pluckDistinct, distinctRecordValues } from '../utils/rx';
import { fromEthersEvent, getNetwork, logToContractEvent } from '../utils/ethers';
import { encode } from '../utils/data';
import { RaidenError, ErrorCodes, assert } from '../utils/error';
import { createBalanceHash, MessageTypeId } from '../messages/utils';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { HumanStandardToken } from '../contracts/HumanStandardToken';
import { findBalanceProofMatchingBalanceHash } from '../transfers/utils';
import { ChannelState } from './state';
import {
  newBlock,
  tokenMonitored,
  channelMonitored,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
} from './actions';
import { assertTx, channelKey, groupChannel$, channelUniqueKey } from './utils';

/**
 * Receives an async function and returns an observable which will retry it every interval until it
 * resolves, or throw if it can't succeed after 10 retries.
 * It is needed e.g. on provider methods which perform RPC requests directly, as they can fail
 * temporarily due to network errors, so they need to be retried for a while.
 * JsonRpcProvider._doPoll also catches, suppresses & retry
 *
 * @param func - An async function (e.g. a Promise factory, like a defer callback)
 * @param interval - Interval to retry in case of rejection
 * @param stopPredicate - Stops retrying and throws if this function returns a truty value;
 *      Receives error and retry count; Default: stops after 10 retries
 * @returns Observable version of async function, with retries
 */
function retryAsync$<T>(
  func: () => Promise<T>,
  interval = 1e3,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stopPredicate: (err: any, count: number) => boolean | undefined = (_, count) => count >= 10,
): Observable<T> {
  return defer(func).pipe(
    retryWhen((error$) =>
      error$.pipe(
        mergeMap((error, count) =>
          stopPredicate(error, count) ? throwError(error) : timer(interval),
        ),
      ),
    ),
  );
}

/**
 * Fetch current blockNumber, register for new block events and emit newBlock actions
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.provider - Eth provider
 * @returns Observable of newBlock actions
 */
export const initNewBlockEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<newBlock> =>
  retryAsync$(() => provider.getBlockNumber(), provider.pollingInterval).pipe(
    mergeMap((blockNumber) => merge(of(blockNumber), fromEthersEvent<number>(provider, 'block'))),
    map((blockNumber) => newBlock({ blockNumber })),
  );

/**
 * If state.tokens is empty (usually only on first run), scan registry and token networks for
 * registered TokenNetworks of interest (ones which has/had channels with us) and monitors them.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.provider - Eth provider
 * @param deps.registryContract - TokenNetworkRegistry contract instance
 * @param deps.contractsInfo - Contracts info mapping
 * @returns Observable of tokenMonitored actions
 */
export const initTokensRegistryEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, provider, registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<tokenMonitored> =>
  state$.pipe(
    take(1),
    filter((state) => isEmpty(state.tokens)), // proceed to scan only if state.tokens isEmpty
    mergeMap(() =>
      retryAsync$(
        () =>
          provider.getLogs({
            ...registryContract.filters.TokenNetworkCreated(null, null),
            fromBlock: contractsInfo.TokenNetworkRegistry.block_number,
            toBlock: 'latest',
          }),
        provider.pollingInterval,
      ),
    ),
    mergeMap(from),
    map((log) => ({ log, parsed: registryContract.interface.parseLog(log) })),
    filter(({ parsed }) => !!parsed.values?.token_network_address),
    // for each TokenNetwork found, scan for channels with us
    mergeMap(
      ({ log, parsed }) => {
        const encodedAddress = defaultAbiCoder.encode(['address'], [address]);
        return concat$(
          // concat channels opened by us and to us separately
          // take(1) won't subscribe the later if something is found on former
          retryAsync$(
            () =>
              provider.getLogs({
                // filter equivalent to tokenNetworkContract.filter.ChannelOpened()
                address: parsed.values.token_network_address,
                topics: [null, null, encodedAddress] as string[], // channels from us
                fromBlock: log.blockNumber!,
                toBlock: 'latest',
              }),
            provider.pollingInterval,
          ).pipe(mergeMap(from)),
          retryAsync$(
            () =>
              provider.getLogs({
                address: parsed.values.token_network_address,
                topics: [null, null, null, encodedAddress] as string[], // channels to us
                fromBlock: log.blockNumber!,
                toBlock: 'latest',
              }),
            provider.pollingInterval,
          ).pipe(mergeMap(from)),
        ).pipe(
          // if found at least one, register this TokenNetwork as of interest
          // else, do nothing
          take(1),
          mapTo(
            tokenMonitored({
              token: parsed.values.token_address,
              tokenNetwork: parsed.values.token_network_address,
              fromBlock: log.blockNumber!,
            }),
          ),
        );
      },
      5, // limit concurrency, don't hammer the node with hundreds of parallel getLogs
    ),
  );

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.network - Current network
 * @param deps.provider - Eth provider
 * @returns Observable of raidenShutdown actions
 */
export const initMonitorProviderEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, network, provider }: RaidenEpicDeps,
): Observable<raidenShutdown> =>
  retryAsync$(() => provider.listAccounts(), provider.pollingInterval).pipe(
    // at init time, check if our address is in provider's accounts list
    // if not, it means Signer is a local Wallet or another non-provider-side account
    // if yes, poll accounts every 1s and monitors if address is still there
    // also, every 1s poll current provider network and monitors if it's the same
    // if any check fails, emits RaidenShutdownAction, nothing otherwise
    // Poll reason from: https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md
    // first/init-time check
    map((accounts) => accounts.includes(address)),
    mergeMap((isProviderAccount) =>
      interval(provider.pollingInterval).pipe(
        exhaustMap(() =>
          merge(
            // if isProviderAccount, also polls and monitors accounts list
            isProviderAccount
              ? retryAsync$(() => provider.listAccounts(), provider.pollingInterval).pipe(
                  mergeMap((accounts) =>
                    !accounts.includes(address)
                      ? of(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }))
                      : EMPTY,
                  ),
                )
              : EMPTY,
            // unconditionally monitors network changes
            retryAsync$(() => getNetwork(provider), provider.pollingInterval).pipe(
              mergeMap((curNetwork) =>
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

// type of elements mapped from contract-emitted events/logs
// [channelId, participant1, participant2, settleTimeout, Event]
type ChannelOpenedEvent = [BigNumber, Address, Address, BigNumber, Event];
// [channelId, participant, totalDeposit, Event]
type ChannelNewDepositEvent = [BigNumber, Address, UInt<32>, Event];
// [channelId, participant, totalWithdraw, Event]
type ChannelWithdrawEvent = [BigNumber, Address, UInt<32>, Event];
// [channelId, participant, nonce, balanceHash, Event]
type ChannelClosedEvent = [BigNumber, Address, UInt<8>, Hash, Event];
// [channelId, part1_amount, part1_locksroot, part2_amount, part2_locksroot Event]
type ChannelSettledEvent = [BigNumber, UInt<32>, Hash, UInt<32>, Hash, Event];
type ChannelEvents =
  | ChannelOpenedEvent
  | ChannelNewDepositEvent
  | ChannelWithdrawEvent
  | ChannelClosedEvent
  | ChannelSettledEvent;

function getChannelEventsTopics(tokenNetworkContract: TokenNetwork) {
  const events = tokenNetworkContract.interface.events;
  return {
    openTopic: events.ChannelOpened.topic,
    depositTopic: events.ChannelNewDeposit.topic,
    withdrawTopic: events.ChannelWithdraw.topic,
    closedTopic: events.ChannelClosed.topic,
    settledTopic: events.ChannelSettled.topic,
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
        const channel = Object.values(state.channels).find(
          (c) => c.tokenNetwork === tokenNetwork && c.id === id,
        );
        // partner will be defined whenever id refers to a past fetched, confirmed and persisted
        // event/channel or an open event seen on this session and still confirming;
        // if it's undefined, this channel is unknown/not with us, and should be filtered out
        const partner =
          channel?.partner?.address ||
          state.pendingTxs.filter(channelOpen.success.is).find((a) => a.payload.id === id)?.meta
            .partner;

        const event = args[args.length - 1] as Event;
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
              const partner = address == p1 ? p2 : p1;
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
              partner &&
              (channel?.id !== id ||
                totalDeposit.gt(
                  channel[participant === channel.partner.address ? 'partner' : 'own'].deposit,
                ))
            )
              action = channelDeposit.success(
                { id, participant, totalDeposit, txHash, txBlock, confirmed },
                { tokenNetwork, partner },
              );
            break;
          }
          case withdrawTopic: {
            const [, participant, totalWithdraw] = args as ChannelWithdrawEvent;
            if (
              partner &&
              (channel?.id !== id ||
                totalWithdraw.gt(
                  channel[participant === channel.partner.address ? 'partner' : 'own'].withdraw,
                ))
            )
              action = channelWithdrawn(
                { id, participant, totalWithdraw, txHash, txBlock, confirmed },
                { tokenNetwork, partner },
              );
            break;
          }
          case closedTopic: {
            if (partner && (channel?.id !== id || !('closeBlock' in channel))) {
              const [, participant] = args as ChannelClosedEvent;
              action = channelClose.success(
                { id, participant, txHash, txBlock, confirmed },
                { tokenNetwork, partner },
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
  return retryAsync$(
    () =>
      Promise.all([
        provider.getLogs({
          ...tokenNetworkContract.filters.ChannelOpened(null, address, null, null),
          fromBlock,
          toBlock,
        }),
        provider.getLogs({
          ...tokenNetworkContract.filters.ChannelOpened(null, null, address, null),
          fromBlock,
          toBlock,
        }),
      ]),
    provider.pollingInterval,
  ).pipe(
    withLatestFrom(latest$),
    mergeMap(([[logs1, logs2], { state }]) => {
      // map Log to ContractEvent and filter out channels which we know are already gone
      const openEvents = logs1
        .concat(logs2)
        .map(logToContractEvent<ChannelOpenedEvent>(tokenNetworkContract))
        .filter(isntNil)
        .filter(([_id, p1, p2]) => {
          const partner = address === p1 ? p2 : p1;
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
      return retryAsync$(
        () =>
          provider.getLogs({
            address: tokenNetwork,
            topics: [
              // events of interest as topics[0], without open events (already fetched above)
              Object.values(getChannelEventsTopics(tokenNetworkContract)).filter(
                (t) => t !== openTopic,
              ),
              channelIds, // ORed channelIds set as topics[1]=channelId
            ],
            fromBlock,
            toBlock,
          }),
        provider.pollingInterval,
      ).pipe(
        // synchronously sort/interleave open|(deposit|withdraw|close|settle) events, and unwind
        mergeMap((logs) => {
          const otherEvents = logs
            .map(
              logToContractEvent<Exclude<ChannelEvents, ChannelOpenedEvent>>(tokenNetworkContract),
            )
            .filter(isntNil);
          const allEvents = [...openEvents, ...otherEvents];
          return from(sortBy(allEvents, (args) => (args[args.length - 1] as Event).blockNumber));
        }),
      );
    }),
    mapChannelEventsToAction([token, tokenNetwork], deps),
  );
}

function fetchNewChannelEvents$([token, tokenNetwork]: [Address, Address], deps: RaidenEpicDeps) {
  const { provider, getTokenNetworkContract, config$ } = deps;
  const tokenNetworkContract = getTokenNetworkContract(tokenNetwork);

  // this mapping is needed to handle channel events emitted before open is confirmed/stored
  const channelFilter: Filter = {
    address: tokenNetwork,
    // set only topics[0], to get also open events (new ids); filter client-side
    topics: [Object.values(getChannelEventsTopics(tokenNetworkContract))],
  };

  return config$.pipe(
    first(),
    mergeMap(({ confirmationBlocks }) =>
      fromEthersEvent<Log>(provider, channelFilter, undefined, confirmationBlocks),
    ),
    map(logToContractEvent<ChannelEvents>(tokenNetworkContract)),
    filter(isntNil),
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
export const channelEventsEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  | tokenMonitored
  | channelOpen.success
  | channelDeposit.success
  | channelWithdrawn
  | channelClose.success
  | channelSettle.success
> =>
  action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    publishReplay(1, undefined, (blockNumber$) =>
      state$.pipe(
        pluck('tokens'),
        distinctRecordValues(),
        withLatestFrom(state$),
        mergeMap(([[token, tokenNetwork], state]) => {
          // fromBlock is latest on-chain event seen for this contract, or registry deployment block +1
          const fromBlock =
            Object.values(state.channels)
              .concat(Object.values(state.oldChannels))
              .filter((channel) => channel.tokenNetwork === tokenNetwork)
              .reduce(
                (acc, channel) =>
                  Math.max(
                    acc,
                    'settleBlock' in channel
                      ? channel.settleBlock
                      : 'closeBlock' in channel
                      ? channel.closeBlock
                      : channel.openBlock,
                  ),
                deps.contractsInfo.TokenNetworkRegistry.block_number,
              ) + 1;

          // notifies when past events fetching completes
          const pastDone$ = new AsyncSubject<true>();

          // blockNumber$ holds latest blockNumber, or waits for it to be fetched
          return blockNumber$.pipe(
            first(),
            mergeMap((toBlock) =>
              // this merge + finalize + delayWhen AsyncSubject outputs like concat, but ensures
              // both subscriptions are done simultaneously, to avoid losing monitored new events
              // or that they'd come before any pastEvent
              merge(
                of(tokenMonitored({ token: token as Address, tokenNetwork, fromBlock, toBlock })),
                fetchPastChannelEvents$(
                  [fromBlock, toBlock],
                  [token as Address, tokenNetwork],
                  deps,
                ).pipe(finalize(() => (pastDone$.next(true), pastDone$.complete()))),
                fetchNewChannelEvents$([token as Address, tokenNetwork], deps).pipe(
                  delayWhen(() => pastDone$), // holds new events until pastEvents fetching ends
                ),
              ),
            ),
          );
        }),
      ),
    ),
  );

/**
 * Emit channelMonitored action for channels on state
 *
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelMonitored actions
 */
export const channelMonitoredEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelMonitored> =>
  state$.pipe(
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

const makeDeposit$ = (
  [tokenContract, tokenNetworkContract]: [HumanStandardToken, TokenNetwork],
  [sender, address, partner]: [Address, Address, Address],
  deposit: UInt<32> | undefined,
  channelId$: Observable<number>,
  { log }: Pick<RaidenEpicDeps, 'log'>,
  approveNonce?: number,
): Observable<channelDeposit.failure> => {
  if (!deposit?.gt(Zero)) return EMPTY;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stopRetryIfRejected(err: any, count: number) {
    // 4001 is Metamask's code for rejected/denied signature prompt
    const metamaskRejectedErrorCode = 4001;
    return count >= 10 || err?.code === metamaskRejectedErrorCode;
  }

  return defer(() => tokenContract.functions.allowance(sender, tokenNetworkContract.address)).pipe(
    mergeMap((allowance) =>
      allowance.gte(deposit)
        ? of(true)
        : retryAsync$(
            () =>
              tokenContract.functions.approve(tokenNetworkContract.address, deposit, {
                nonce: approveNonce,
              }),
            (tokenContract.provider as JsonRpcProvider).pollingInterval,
            stopRetryIfRejected,
          ).pipe(
            // if needed, send approveTx and wait/assert it before proceeding
            assertTx('approve', ErrorCodes.CNL_APPROVE_TRANSACTION_FAILED, { log }),
          ),
    ),
    mergeMapTo(channelId$),
    take(1),
    mergeMap((id) =>
      // get current 'view' of own/'address' deposit, despite any other pending deposits
      tokenNetworkContract.functions
        .getChannelParticipantInfo(id, address, partner)
        .then(({ 0: totalDeposit }) => [id, totalDeposit] as const),
    ),
    mergeMap(([id, totalDeposit]) =>
      // send setTotalDeposit transaction
      retryAsync$(
        () =>
          tokenNetworkContract.functions.setTotalDeposit(
            id,
            address,
            totalDeposit.add(deposit),
            partner,
          ),
        (tokenNetworkContract.provider as JsonRpcProvider).pollingInterval,
        stopRetryIfRejected,
      ),
    ),
    assertTx('setTotalDeposit', ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED, { log }),
    // ignore success so it's picked by channelEventsEpic
    ignoreElements(),
    catchError((error) =>
      of(
        channelDeposit.failure(error, {
          tokenNetwork: tokenNetworkContract.address as Address,
          partner,
        }),
      ),
    ),
  );
};

/**
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as ChannelOpened success action
 * will instead be detected and fired by channelEventsEpic. If anything detectable goes wrong,
 * fires a ChannnelOpenActionFailed instead
 *
 * @param action$ - Observable of channelOpen actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.getTokenContract - Token contract instance getter
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Observable of channelOpen.failure actions
 */
export const channelOpenEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    getTokenContract,
    getTokenNetworkContract,
    config$,
  }: RaidenEpicDeps,
): Observable<channelOpen.failure | channelDeposit.failure> =>
  action$.pipe(
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
      const { signer: onchainSigner, address: onchainAddress } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      // if also requested deposit
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
      const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);

      return action$.pipe(
        filter(channelOpen.success.is),
        filter((a) => a.meta.tokenNetwork === tokenNetwork && a.meta.partner === partner),
        pluck('payload', 'id'),
        // channelId$ will "cache" matching channelOpen.success id, if needed, even unconfirmed
        publishReplay(1, undefined, (channelId$) =>
          // send openChannel transaction; errors here also unsubscribe from deposit
          defer(() =>
            tokenNetworkContract.functions.openChannel(
              address,
              partner,
              action.payload.settleTimeout ?? settleTimeout,
            ),
          ).pipe(
            mergeMap((tx) =>
              // openTx wait in parallel with approve + setTotalDeposit
              merge(
                of(tx).pipe(
                  assertTx('openChannel', ErrorCodes.CNL_OPENCHANNEL_FAILED, { log }),
                  ignoreElements(),
                ),
                // errors on makeDeposit$ are handled independently and don't fail open request
                // but the channelDeposit.failure action may be fired
                makeDeposit$(
                  [tokenContract, tokenNetworkContract],
                  [onchainAddress, address, partner],
                  action.payload.deposit,
                  channelId$,
                  { log },
                  tx.nonce + 1,
                ),
              ),
            ),
            // ignore success so it's picked by channelEventsEpic
            catchError((error) => of(channelOpen.failure(error, action.meta))),
          ),
        ),
      );
    }),
  );

/**
 * A ChannelDeposit action requested by user
 * Needs to be called on a previously monitored channel. Calls Token.approve for TokenNetwork
 * and then set respective setTotalDeposit. If all tx go through successfuly, stop as
 * ChannelDeposited success action will instead be detected and reacted by channelEventsEpic.
 * If anything detectable goes wrong, fires a ChannelDepositActionFailed instead
 *
 * @param action$ - Observable of channelDeposit.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.getTokenContract - Token contract instance getter
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Observable of channelDeposit.failure actions
 */
export const channelDepositEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    getTokenContract,
    getTokenNetworkContract,
    config$,
  }: RaidenEpicDeps,
): Observable<channelDeposit.failure> =>
  action$.pipe(
    filter(isActionOf(channelDeposit.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const { tokenNetwork, partner } = action.meta;
      const key = channelKey(action.meta);
      const channel = state.channels[key];
      if (channel?.state !== ChannelState.open) {
        const error = new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, action.meta);
        return of(channelDeposit.failure(error, action.meta));
      }
      const { signer: onchainSigner, address: onchainAddress } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenContract = getContractWithSigner(getTokenContract(channel.token), onchainSigner);
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );

      return makeDeposit$(
        [tokenContract, tokenNetworkContract],
        [onchainAddress, address, partner],
        action.payload.deposit,
        of(channel.id),
        { log },
      );
    }),
  );

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
 * @param deps.network - Current network
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Observable of channelClose.failure actions
 */
export const channelCloseEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, network, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelClose.failure> =>
  action$.pipe(
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

      const closingMessage = concat([
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
          tokenNetworkContract.functions.closeChannel(
            channel.id,
            partner,
            address,
            balanceHash,
            nonce,
            additionalHash,
            nonClosingSignature,
            closingSignature,
          ),
        ),
        assertTx('closeChannel', ErrorCodes.CNL_CLOSECHANNEL_FAILED, { log }),
        // if succeeded, return a empty/completed observable
        // actual ChannelClosedAction will be detected and handled by channelEventsEpic
        // if any error happened on tx call/pipeline, catchError will then emit the
        // channelClose.failure action instead
        ignoreElements(),
        catchError((error) => of(channelClose.failure(error, action.meta))),
      );
    }),
  );

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
 * @param deps.network - Current network
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Empty observable
 */
export const channelUpdateEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, network, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelSettle.failure> =>
  action$.pipe(
    filter(isActionOf(channelClose.success)),
    filter((action) => !!action.payload.confirmed),
    // wait 2 newBlock actions go through after channelClose confirmation, to ensure any pending
    // channelSettle could have been processed
    mergeMap((action) => action$.pipe(filter(newBlock.is), skip(1), take(1), mapTo(action))),
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

      const nonClosingMessage = concat([
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
          tokenNetworkContract.functions.updateNonClosingBalanceProof(
            channel.id,
            partner,
            address,
            balanceHash,
            nonce,
            additionalHash,
            closingSignature,
            nonClosingSignature,
          ),
        ),
        assertTx('updateNonClosingBalanceProof', ErrorCodes.CNL_UPDATE_NONCLOSING_BP_FAILED, {
          log,
        }),
        // if succeeded, return a empty/completed observable
        ignoreElements(),
        catchError((error) => {
          log.error('Error updating non-closing balance-proof, ignoring', error);
          return EMPTY;
        }),
      );
    }),
  );

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
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Observable of channelSettle.failure actions
 */
export const channelSettleEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelSettle.failure> =>
  action$.pipe(
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
      if (channel?.state !== ChannelState.settleable && channel?.state !== ChannelState.settling) {
        const error = new RaidenError(
          ErrorCodes.CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND,
          action.meta,
        );
        return of(channelSettle.failure(error, action.meta));
      }

      return from(
        // fetch closing/updated balanceHash for each end
        Promise.all([
          tokenNetworkContract.functions.getChannelParticipantInfo(channel.id, address, partner),
          tokenNetworkContract.functions.getChannelParticipantInfo(channel.id, partner, address),
        ]),
      ).pipe(
        mergeMap(([{ 3: ownBH }, { 3: partnerBH }]) => {
          let ownBP = channel.own.balanceProof;
          if (ownBH !== createBalanceHash(ownBP)) {
            // partner closed/updated the channel with a non-latest BP from us
            // they would lose our later transfers, but to settle we must search transfer history
            const bp = findBalanceProofMatchingBalanceHash(state.sent, ownBH as Hash, action.meta);
            assert(bp, [
              ErrorCodes.CNL_SETTLECHANNEL_INVALID_BALANCEHASH,
              { address, ownBalanceHash: ownBH },
            ]);
            ownBP = bp;
          }

          let partnerBP = channel.partner.balanceProof;
          if (partnerBH !== createBalanceHash(partnerBP)) {
            // shouldn't happen: if we closed, we must have done so with partner's latest BP
            const bp = findBalanceProofMatchingBalanceHash(
              state.received,
              partnerBH as Hash,
              action.meta,
            );
            assert(bp, [
              ErrorCodes.CNL_SETTLECHANNEL_INVALID_BALANCEHASH,
              { partner, partnerBalanceHash: partnerBH },
            ]);
            partnerBP = bp;
          }

          let part1 = [address, ownBP] as const;
          let part2 = [partner, partnerBP] as const;

          // part1 total amounts must be <= part2 total amounts on settleChannel call
          if (
            part2[1].transferredAmount
              .add(part2[1].lockedAmount)
              .lt(part1[1].transferredAmount.add(part1[1].lockedAmount))
          )
            [part1, part2] = [part2, part1]; // swap

          // send settleChannel transaction
          return tokenNetworkContract.functions.settleChannel(
            channel.id,
            part1[0],
            part1[1].transferredAmount,
            part1[1].lockedAmount,
            part1[1].locksroot,
            part2[0],
            part2[1].transferredAmount,
            part2[1].lockedAmount,
            part2[1].locksroot,
          );
        }),
        assertTx('settleChannel', ErrorCodes.CNL_SETTLECHANNEL_FAILED, { log }),
        // if succeeded, return a empty/completed observable
        // actual ChannelSettledAction will be detected and handled by channelEventsEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelSettle.failure action instead
        ignoreElements(),
        catchError((error) => of(channelSettle.failure(error, action.meta))),
      );
    }),
  );

/**
 * Process newBlocks, emits ChannelSettleableAction if any closed channel is now settleable
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelSettleable actions
 */
export const channelSettleableEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelSettleable> =>
  action$.pipe(
    filter(isActionOf(newBlock)),
    withLatestFrom(state$),
    mergeMap(function* ([
      {
        payload: { blockNumber },
      },
      state,
    ]) {
      for (const channel of Object.values(state.channels)) {
        if (
          channel.state === ChannelState.closed &&
          blockNumber > channel.closeBlock + channel.settleTimeout
        ) {
          yield channelSettleable(
            { settleableBlock: blockNumber },
            { tokenNetwork: channel.tokenNetwork, partner: channel.partner.address },
          );
        }
      }
    }),
  );

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
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @returns Empty observable
 */
export const channelUnlockEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, signer, address, main, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelSettle.failure> =>
  action$.pipe(
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
      const locks = concat(
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
      return from(
        tokenNetworkContract.functions.unlock(action.payload.id, address, partner, locks),
      ).pipe(
        assertTx('unlock', ErrorCodes.CNL_ONCHAIN_UNLOCK_FAILED, { log }),
        ignoreElements(),
        catchError((error) => {
          log.error('Error unlocking pending locks on-chain, ignoring', error);
          return EMPTY;
        }),
      );
    }),
  );

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
      if (receipt?.confirmations !== undefined && receipt.confirmations >= confirmationBlocks) {
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
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @returns Observable of confirmed or removed actions
 */
export const confirmationEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, provider }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  combineLatest(
    state$.pipe(pluckDistinct('blockNumber')),
    state$.pipe(pluck('pendingTxs')),
    config$.pipe(pluckDistinct('confirmationBlocks')),
  ).pipe(
    filter(([, pendingTxs]) => pendingTxs.length > 0),
    // exhaust will ignore blocks while concat$ is busy
    exhaustMap(([blockNumber, pendingTxs, confirmationBlocks]) =>
      concat$(
        ...pendingTxs
          // only txs/confirmable actions which are more than confirmationBlocks in the past
          .filter((a) => a.payload.txBlock + confirmationBlocks <= blockNumber)
          .map((action) => checkPendingAction(action, provider, blockNumber, confirmationBlocks)),
      ),
    ),
  );
