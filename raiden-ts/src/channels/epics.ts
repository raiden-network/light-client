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
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  tap,
  takeWhile,
  withLatestFrom,
  groupBy,
  exhaustMap,
  first,
  take,
  mapTo,
  pluck,
  publishReplay,
  ignoreElements,
  skip,
  retryWhen,
} from 'rxjs/operators';
import findKey from 'lodash/findKey';
import isEmpty from 'lodash/isEmpty';
import negate from 'lodash/negate';

import { BigNumber, concat, defaultAbiCoder } from 'ethers/utils';
import { Event } from 'ethers/contract';
import { Zero } from 'ethers/constants';
import { Filter } from 'ethers/providers';

import { RaidenEpicDeps } from '../types';
import { RaidenAction, raidenShutdown, ConfirmableAction } from '../actions';
import { ChannelState } from '../channels';
import { RaidenState } from '../state';
import { ShutdownReason } from '../constants';
import { chooseOnchainAccount, getContractWithSigner } from '../helpers';
import { Address, Hash, UInt, Signature, isntNil, HexString } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { pluckDistinct } from '../utils/rx';
import { fromEthersEvent, getEventsStream, getNetwork } from '../utils/ethers';
import { encode } from '../utils/data';
import { RaidenError, ErrorCodes } from '../utils/error';
import { createBalanceHash, MessageTypeId } from '../messages/utils';
import {
  newBlock,
  tokenMonitored,
  channelMonitor,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
} from './actions';
import { assertTx, channelKey } from './utils';

/**
 * Receives an async function and returns an observable which will retry it every interval until it
 * resolves, or throw if it can't succeed after 10 retries.
 * It is needed e.g. on provider methods which perform RPC requests directly, as they can fail
 * temporarily due to network errors, so they need to be retried for a while.
 * JsonRpcProvider._doPoll also catches, suppresses & retry
 *
 * @param func - An async function (e.g. a Promise factory, like a defer callback)
 * @param interval - Interval to retry in case of rejection
 * @param retries - Max number of times to retry
 * @returns Observable version of async function, with retries
 */
function retryAsync$<T>(func: () => Promise<T>, interval = 1e3, retries = 10): Observable<T> {
  return defer(func).pipe(
    retryWhen((err$) =>
      err$.pipe(mergeMap((err, i) => (i < retries ? timer(interval) : throwError(err)))),
    ),
  );
}

/**
 * Fetch current blockNumber, register for new block events and emit newBlock actions
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param provider - RaidenEpicDeps members
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
 * On first run, scan registry and token networks for registered TokenNetworks of interest
 * (ones which has/had channels with us) and monitors them. On next runs, just monitors the
 * previously monitored ones.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param registryContract,contractsInfo - RaidenEpicDeps members
 * @returns Observable of tokenMonitored actions
 */
export const initTokensRegistryEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, provider, registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<tokenMonitored> =>
  state$.pipe(
    take(1),
    mergeMap((state) => {
      const encodedAddress = defaultAbiCoder.encode(['address'], [address]);
      // if tokens are already initialized, use it
      if (!isEmpty(state.tokens))
        return from(
          (Object.entries(state.tokens) as [Address, Address][]).map(([token, tokenNetwork]) =>
            tokenMonitored({ token, tokenNetwork }),
          ),
        );
      // else, do an initial registry scan, from deploy to now
      else
        return retryAsync$(
          () =>
            provider.getLogs({
              ...registryContract.filters.TokenNetworkCreated(null, null),
              fromBlock: contractsInfo.TokenNetworkRegistry.block_number,
              toBlock: 'latest',
            }),
          provider.pollingInterval,
        ).pipe(
          mergeMap((logs) => from(logs)),
          map((log) => ({ log, parsed: registryContract.interface.parseLog(log) })),
          filter(({ parsed }) => !!parsed.values?.token_network_address),
          // for each TokenNetwork found, scan for channels with us
          mergeMap(
            ({ log, parsed }) =>
              concat$(
                // concat channels opened by us and to us separately
                // take(1) won't subscribe the later if something is found on former
                retryAsync$(
                  () =>
                    provider.getLogs({
                      address: parsed.values.token_network_address,
                      topics: [null, null, encodedAddress] as string[], // channels from us
                      fromBlock:
                        log.blockNumber ?? contractsInfo.TokenNetworkRegistry.block_number,
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
              ),
            5, // limit concurrency, don't hammer the node with hundreds of parallel getLogs
          ),
        );
    }),
  );

/**
 * Monitor channels previously already on state
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelMonitor actions
 */
export const initMonitorChannelsEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelMonitor> =>
  state$.pipe(
    first(),
    mergeMap(function* (state) {
      for (const channel of Object.values(state.channels)) {
        yield channelMonitor(
          { id: channel.id },
          { tokenNetwork: channel.tokenNetwork, partner: channel.partner.address },
        );
      }
    }),
  );

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param address,network,provider - RaidenEpicDeps members
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

/**
 * Starts monitoring a token network for events
 * When this action goes through (because a former or new token registry event was deteceted),
 * subscribe to events and emit respective actions to the stream. Currently:
 * - ChannelOpened events with us or by us
 *
 * @param action$ - Observable of tokenMonitored actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of channelOpen.success actions
 */
export const tokenMonitoredEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<channelOpen.success> =>
  action$.pipe(
    filter(isActionOf(tokenMonitored)),
    groupBy((action) => action.payload.tokenNetwork),
    mergeMap((grouped$) =>
      grouped$.pipe(
        exhaustMap((action) => {
          const tokenNetworkContract = getTokenNetworkContract(action.payload.tokenNetwork);

          // type of elements emitted by getEventsStream (past and new events coming from
          // contract): [channelId, partner1, partner2, settleTimeout, Event]
          return getEventsStream<[BigNumber, Address, Address, BigNumber, Event]>(
            tokenNetworkContract,
            // it's cheaper for monitoring to fetch all channels and filter client-side,
            // than to query/create/request 2 filters on every block (from and to us)
            [tokenNetworkContract.filters.ChannelOpened(null, null, null, null)],
            // if first time monitoring this token network,
            // fetch TokenNetwork's pastEvents since registry deployment as fromBlock$
            action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
          ).pipe(
            filter(([, p1, p2]) => p1 === address || p2 === address),
            map(([id, p1, p2, settleTimeout, event]) =>
              channelOpen.success(
                {
                  id: id.toNumber(),
                  token: action.payload.token,
                  settleTimeout: settleTimeout.toNumber(),
                  isFirstParticipant: address === p1,
                  txHash: event.transactionHash! as Hash,
                  txBlock: event.blockNumber!,
                  confirmed: undefined,
                },
                {
                  tokenNetwork: tokenNetworkContract.address as Address,
                  partner: address === p1 ? p2 : p1,
                },
              ),
            ),
          );
        }),
      ),
    ),
  );

/**
 * When we see a new ChannelOpenedAction event, starts monitoring channel
 *
 * @param action$ - Observable of channelOpen.success actions
 * @returns Observable of channelMonitor actions
 */
export const channelOpenedEpic = (action$: Observable<RaidenAction>): Observable<channelMonitor> =>
  action$.pipe(
    filter(isActionOf(channelOpen.success)),
    filter((action) => !!action.payload.confirmed),
    map((action) =>
      channelMonitor(
        {
          id: action.payload.id,
          // fetch past events as well, if needed, including events before confirmation
          fromBlock: action.payload.txBlock,
        },
        action.meta,
      ),
    ),
  );

/**
 * Monitors a channel for channel Events
 * Can be called either at initialization time (for previously known channels on previously
 * monitored TokenNetwork) or by a new detected ChannelOpenedAction. On the later case,
 * also fetches events since Channel.openBlock.
 * Currently monitored events:
 * - ChannelNewDeposit, fires a channelDeposit.success action
 * - ChannelClosedEvent, fires a channelClose.success action
 * - ChannelSettledEvent, fires a channelSettle.success action and completes that channel observable
 *
 * @param action$ - Observable of channelMonitor actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of channelDeposit.success,channelClose.success,channelSettle.success actions
 */
export const channelMonitoredEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { getTokenNetworkContract, latest$ }: RaidenEpicDeps,
): Observable<
  channelDeposit.success | channelWithdrawn | channelClose.success | channelSettle.success
> =>
  action$.pipe(
    filter(isActionOf(channelMonitor)),
    groupBy((action) => `${action.payload.id}#${channelKey(action.meta)}`),
    mergeMap((grouped$) =>
      grouped$.pipe(
        exhaustMap((action) => {
          const { tokenNetwork } = action.meta;
          const tokenNetworkContract = getTokenNetworkContract(tokenNetwork);

          // type of elements emitted by getEventsStream (past and new events coming from
          // contract): [channelId, participant, totalDeposit, Event]
          type ChannelNewDepositEvent = [BigNumber, Address, UInt<32>, Event];
          // [channelId, participant, totalWithdraw, Event]
          type ChannelWithdrawEvent = [BigNumber, Address, UInt<32>, Event];
          // [channelId, participant, nonce, balanceHash, Event]
          type ChannelClosedEvent = [BigNumber, Address, UInt<8>, Hash, Event];
          // [channelId, part1_amount, part1_locksroot, part2_amount, part2_locksroot Event]
          type ChannelSettledEvent = [BigNumber, UInt<32>, Hash, UInt<32>, Hash, Event];

          const depositFilter = tokenNetworkContract.filters.ChannelNewDeposit(
              action.payload.id,
              null,
              null,
            ),
            withdrawFilter = tokenNetworkContract.filters.ChannelWithdraw(
              action.payload.id,
              null,
              null,
            ),
            closedFilter = tokenNetworkContract.filters.ChannelClosed(
              action.payload.id,
              null,
              null,
              null,
            ),
            settledFilter = tokenNetworkContract.filters.ChannelSettled(
              action.payload.id,
              null,
              null,
              null,
              null,
            ),
            mergedFilter: Filter = {
              address: tokenNetworkContract.address,
              topics: [
                [
                  depositFilter.topics![0],
                  withdrawFilter.topics![0],
                  closedFilter.topics![0],
                  settledFilter.topics![0],
                ],
                [settledFilter.topics![1]],
              ],
            };

          /**
           * Guards that an event data tuple matches the type of a given filter
           *
           * Type must be explicitly passed as generic type parameter, and a corresponding filter
           * as first parameter
           *
           * @param filter - Filter of an event of type T
           * @param data - event data tuple, where last element is the Event object
           * @returns Truty if event data matches filter
           */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          function isEvent<T extends any[]>(filter: Filter, data: any[]): data is T {
            const event = data[data.length - 1] as Event;
            if (!event || !event.topics || !filter.topics) return false;
            const topic0 = filter.topics[0];
            return Array.isArray(topic0)
              ? topic0.includes(event.topics[0])
              : topic0 === event.topics[0];
          }

          return getEventsStream<
            | ChannelNewDepositEvent
            | ChannelWithdrawEvent
            | ChannelClosedEvent
            | ChannelSettledEvent
          >(
            tokenNetworkContract,
            [mergedFilter],
            // if channelMonitor triggered by channelOpen.success,
            // fetch Channel's pastEvents since channelOpen.success blockNumber as fromBlock$
            action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
          ).pipe(
            withLatestFrom(latest$.pipe(pluck('state', 'channels'))),
            map(([data, channels]) => {
              if (isEvent<ChannelNewDepositEvent>(depositFilter, data)) {
                const [id, participant, totalDeposit, event] = data;
                return channelDeposit.success(
                  {
                    id: id.toNumber(),
                    participant,
                    totalDeposit,
                    txHash: event.transactionHash! as Hash,
                    txBlock: event.blockNumber!,
                    confirmed: undefined,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelWithdrawEvent>(withdrawFilter, data)) {
                const [id, participant, totalWithdraw, event] = data;
                return channelWithdrawn(
                  {
                    id: id.toNumber(),
                    participant,
                    totalWithdraw,
                    txHash: event.transactionHash! as Hash,
                    txBlock: event.blockNumber!,
                    confirmed: undefined,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelClosedEvent>(closedFilter, data)) {
                const [id, participant, , , event] = data;
                return channelClose.success(
                  {
                    id: id.toNumber(),
                    participant,
                    txHash: event.transactionHash! as Hash,
                    txBlock: event.blockNumber!,
                    confirmed: undefined,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelSettledEvent>(settledFilter, data)) {
                const [id, , , , , event] = data;
                return channelSettle.success(
                  {
                    id: id.toNumber(),
                    txHash: event.transactionHash! as Hash,
                    txBlock: event.blockNumber!,
                    confirmed: undefined,
                    locks: channels[channelKey(action.meta)]?.partner?.locks,
                  },
                  action.meta,
                );
              }
            }),
            filter(isntNil),
            // takeWhile tends to broad input to generic Action. We need to narrow it explicitly
            takeWhile<
              | channelDeposit.success
              | channelWithdrawn
              | channelClose.success
              | channelSettle.success
            >(negate(channelSettle.success.is), true),
          );
        }),
      ),
    ),
  );

/**
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as ChannelOpened success action
 * will instead be detected and fired by tokenMonitoredEpic. If anything detectable goes wrong,
 * fires a ChannnelOpenActionFailed instead
 *
 * @param action$ - Observable of channelOpen actions
 * @param state$ - Observable of RaidenStates
 * @param getTokenNetworkContract - RaidenEpicDeps members
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
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      // if also requested deposit
      const deposit =
        !action.payload.deposit || action.payload.deposit.isZero()
          ? undefined
          : action.payload.deposit;
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
      const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);

      return action$.pipe(
        filter(channelOpen.success.is),
        filter((a) => a.meta.tokenNetwork === tokenNetwork && a.meta.partner === partner),
        // opened$ will "cache" matching channelOpen.success, if needed
        publishReplay(1, undefined, (opened$) =>
          // send openChannel transaction
          defer(() =>
            tokenNetworkContract.functions.openChannel(
              address,
              partner,
              action.payload.settleTimeout ?? settleTimeout,
            ),
          ).pipe(
            // Wallet signer depends on fetching the 'pending' tx count to fill 'nonce'
            // therefore we need to send open then approve, instead of doing them parallely
            mergeMap((openTx) =>
              deposit
                ? from(tokenContract.functions.approve(tokenNetwork, deposit)).pipe(
                    map((approveTx) => [openTx, approveTx] as const),
                  )
                : of([openTx] as const),
            ),
            // can't share logic with channelDepositEpic, because parallelism of txs needs to be
            // strict, nor use assertTx for approve|openChannel parallel txs
            tap(([tx]) => log.debug(`sent openChannel tx "${tx.hash}" to "${tokenNetwork}"`)),
            tap(([, tx]) => (tx ? log.debug(`sent approve tx "${tx.hash}" to "${token}"`) : 0)),
            mergeMap(([openTx, approveTx]) =>
              combineLatest([
                from(openTx.wait()).pipe(map((receipt) => ({ tx: openTx, receipt }))),
                approveTx
                  ? from(approveTx.wait()).pipe(map((receipt) => ({ tx: approveTx, receipt })))
                  : of(undefined),
              ]),
            ),
            mergeMap(([open, approve]) => {
              if (!open.receipt.status)
                throw new RaidenError(ErrorCodes.CNL_OPENCHANNEL_FAILED, {
                  ...action.meta,
                  transactionHash: open.tx.hash!,
                });
              log.debug(`openChannel tx "${open.tx.hash}" successfuly mined!`);
              // now that channel is opened, check approve and proceed to setTotalDeposit
              // if no deposit requested, EMPTY will skip rest of this chain
              return (approve ? of(approve) : EMPTY).pipe(
                mergeMap(({ tx, receipt }) => {
                  if (!receipt.status)
                    throw new RaidenError(ErrorCodes.CNL_APPROVE_TRANSACTION_FAILED, {
                      token,
                      transactionHash: tx.hash!,
                    });
                  log.debug(`approve tx "${tx.hash}" successfuly mined!`);
                  // wait or use cached channelOpen.success, unconfirmed
                  return opened$.pipe(
                    first(),
                    mergeMap(({ payload: { id } }) =>
                      tokenNetworkContract.functions.setTotalDeposit(
                        id,
                        address,
                        deposit!,
                        partner,
                      ),
                    ),
                  );
                }),
                assertTx('setTotalDeposit', ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED, { log }),
                // ignore success so it's picked by channelMonitoredEpic
                ignoreElements(),
                catchError((error) => of(channelDeposit.failure(error, action.meta))),
              );
            }),
            // ignore success so it's picked by tokenMonitoredEpic
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
 * ChannelDeposited success action will instead be detected and reacted by
 * channelMonitoredEpic. If anything detectable goes wrong, fires a ChannelDepositActionFailed
 * instead
 *
 * @param action$ - Observable of channelDeposit.request actions
 * @param state$ - Observable of RaidenStates
 * @param address,getTokenContract,getTokenNetworkContract - RaidenEpicDeps members
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
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork) as Address | undefined;
      if (!token) {
        const error = new RaidenError(ErrorCodes.CNL_TOKEN_NOT_FOUND, action.meta);
        return of(channelDeposit.failure(error, action.meta));
      }
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );
      const key = channelKey(action.meta);
      const channel = state.channels[key];
      if (channel?.state !== ChannelState.open) {
        const error = new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, action.meta);
        return of(channelDeposit.failure(error, action.meta));
      }

      // send approve transaction
      return from(tokenContract.functions.approve(tokenNetwork, action.payload.deposit)).pipe(
        assertTx('approve', ErrorCodes.CNL_APPROVE_TRANSACTION_FAILED, { log }),
        withLatestFrom(state$),
        mergeMap(([, state]) =>
          // send setTotalDeposit transaction
          tokenNetworkContract.functions.setTotalDeposit(
            channel.id,
            address,
            state.channels[key].own.deposit.add(action.payload.deposit),
            partner,
          ),
        ),
        assertTx('setTotalDeposit', ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED, { log }),
        // if succeeded, return a empty/completed observable
        // actual ChannelDepositedAction will be detected and handled by channelMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelDeposit.failure action instead
        ignoreElements(),
        catchError((error) => of(channelDeposit.failure(error, action.meta))),
      );
    }),
  );

/**
 * A ChannelClose action requested by user
 * Needs to be called on an opened or closing (for retries) channel.
 * If tx goes through successfuly, stop as ChannelClosed success action will instead be
 * detected and reacted by channelMonitoredEpic. If anything detectable goes wrong, fires a
 * ChannelCloseActionFailed instead
 *
 * @param action$ - Observable of channelClose actions
 * @param state$ - Observable of RaidenStates
 * @param getTokenNetworkContract - RaidenEpicDeps members
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

      const balanceHash = createBalanceHash(
        channel.partner.balanceProof.transferredAmount,
        channel.partner.balanceProof.lockedAmount,
        channel.partner.balanceProof.locksroot,
      );
      const nonce = channel.partner.balanceProof.nonce;
      const additionalHash = channel.partner.balanceProof.additionalHash;
      const nonClosingSignature = channel.partner.balanceProof.signature;

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
        // actual ChannelClosedAction will be detected and handled by channelMonitoredEpic
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

      const balanceHash = createBalanceHash(
        channel.partner.balanceProof.transferredAmount,
        channel.partner.balanceProof.lockedAmount,
        channel.partner.balanceProof.locksroot,
      );
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
 * If tx goes through successfuly, stop as ChannelSettled success action will instead be
 * detected and reacted by channelMonitoredEpic. If anything detectable goes wrong, fires a
 * ChannelSettleActionFailed instead
 *
 * @param action$ - Observable of channelSettle actions
 * @param state$ - Observable of RaidenStates
 * @param address,getTokenNetworkContract - RaidenEpicDeps members
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
      const { tokenNetwork } = action.meta;
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

      let part1 = channel.own;
      let part2 = channel.partner;

      // part1 total amounts must be <= part2 total amounts on settleChannel call
      if (
        part2.balanceProof.transferredAmount
          .add(part2.balanceProof.lockedAmount)
          .lt(part1.balanceProof.transferredAmount.add(part1.balanceProof.lockedAmount))
      )
        [part1, part2] = [part2, part1];

      // send settleChannel transaction
      return from(
        tokenNetworkContract.functions.settleChannel(
          channel.id,
          part1.address,
          part1.balanceProof.transferredAmount,
          part1.balanceProof.lockedAmount,
          part1.balanceProof.locksroot,
          part2.address,
          part2.balanceProof.transferredAmount,
          part2.balanceProof.lockedAmount,
          part2.balanceProof.locksroot,
        ),
      ).pipe(
        assertTx('settleChannel', ErrorCodes.CNL_SETTLECHANNEL_FAILED, { log }),
        // if succeeded, return a empty/completed observable
        // actual ChannelSettledAction will be detected and handled by channelMonitoredEpic
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
): Observable<ConfirmableAction> {
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
          payload: { ...action.payload, txBlock: receipt.blockNumber!, confirmed: true },
        } as ConfirmableAction;
      } else if (action.payload.txBlock + 2 * confirmationBlocks < blockNumber) {
        // if this txs didn't get confirmed for more than 2*confirmationBlocks, it was removed
        return {
          ...action,
          payload: { ...action.payload, confirmed: false },
        } as ConfirmableAction;
      } // else, it seems removed, but give it twice confirmationBlocks to be picked up again
    }),
    filter(isntNil),
  );
}

/**
 * Process new blocks and re-emit confirmed or removed actions
 *
 * @param action$ - Observable of channelSettle actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @param deps.config$,deps.provider - RaidenEpicDeps members
 * @returns Observable of confirmed or removed actions
 */
export const confirmationEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, provider }: RaidenEpicDeps,
): Observable<ConfirmableAction> =>
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
