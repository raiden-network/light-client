import { Observable, from, of, EMPTY, merge, interval } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  mergeMapTo,
  tap,
  takeWhile,
  withLatestFrom,
  groupBy,
  exhaustMap,
  first,
  publishReplay,
  switchMap,
} from 'rxjs/operators';
import { findKey, get, isEmpty, negate } from 'lodash';

import { BigNumber, hexlify, concat } from 'ethers/utils';
import { Event } from 'ethers/contract';
import { HashZero, Zero } from 'ethers/constants';
import { Filter } from 'ethers/providers';

import { RaidenEpicDeps } from '../types';
import { RaidenAction, raidenShutdown } from '../actions';
import { Channel, ChannelState } from '../channels';
import { RaidenState } from '../state';
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
import { SignatureZero, ShutdownReason } from '../constants';
import { chooseOnchainAccount, getContractWithSigner } from '../helpers';
import { Address, Hash, UInt, Signature } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { fromEthersEvent, getEventsStream, getNetwork } from '../utils/ethers';
import { encode } from '../utils/data';

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
  from(provider.getBlockNumber()).pipe(
    mergeMap(blockNumber => merge(of(blockNumber), fromEthersEvent<number>(provider, 'block'))),
    map(blockNumber => newBlock({ blockNumber })),
  );

/**
 * Monitor registry for new token networks and monitor them
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param registryContract,contractsInfo - RaidenEpicDeps members
 * @returns Observable of tokenMonitored actions
 */
export const initMonitorRegistryEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<tokenMonitored> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
      state$.pipe(
        first(),
        switchMap(state =>
          merge(
            // monitor old (in case of empty tokens) and new registered tokens
            // and starts monitoring every registered token
            getEventsStream<[Address, Address, Event]>(
              registryContract,
              [registryContract.filters.TokenNetworkCreated(null, null)],
              isEmpty(state.tokens)
                ? of(contractsInfo.TokenNetworkRegistry.block_number)
                : undefined,
            ).pipe(
              withLatestFrom(state$),
              map(([[token, tokenNetwork, event], state]) =>
                tokenMonitored({
                  token,
                  tokenNetwork,
                  fromBlock: !(token in state.tokens) ? event.blockNumber : undefined,
                }),
              ),
            ),
            // monitor previously monitored tokens
            from(Object.entries(state.tokens)).pipe(
              map(([token, tokenNetwork]) =>
                tokenMonitored({ token: token as Address, tokenNetwork }),
              ),
            ),
          ),
        ),
      ),
    ),
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
    mergeMap(function*(state) {
      for (const [tokenNetwork, obj] of Object.entries(state.channels)) {
        for (const [partner, channel] of Object.entries(obj)) {
          if (channel.state === ChannelState.opening) continue;
          yield channelMonitor(
            { id: channel.id },
            { tokenNetwork: tokenNetwork as Address, partner: partner as Address },
          );
        }
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
  from(provider.listAccounts()).pipe(
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
    groupBy(action => action.payload.tokenNetwork),
    mergeMap(grouped$ =>
      grouped$.pipe(
        exhaustMap(action => {
          const tokenNetworkContract = getTokenNetworkContract(action.payload.tokenNetwork);

          // type of elements emitted by getEventsStream (past and new events coming from
          // contract): [channelId, partner1, partner2, settleTimeout, Event]
          type ChannelOpenedEvent = [BigNumber, Address, Address, BigNumber, Event];

          const filters = [
            tokenNetworkContract.filters.ChannelOpened(null, address, null, null),
            tokenNetworkContract.filters.ChannelOpened(null, null, address, null),
          ];

          return getEventsStream<ChannelOpenedEvent>(
            tokenNetworkContract,
            filters,
            // if first time monitoring this token network,
            // fetch TokenNetwork's pastEvents since registry deployment as fromBlock$
            action.payload.fromBlock ? of(action.payload.fromBlock) : undefined,
          ).pipe(
            filter(([, p1, p2]) => p1 === address || p2 === address),
            map(([id, p1, p2, settleTimeout, event]) =>
              channelOpen.success(
                {
                  id: id.toNumber(),
                  settleTimeout: settleTimeout.toNumber(),
                  openBlock: event.blockNumber!,
                  isFirstParticipant: address === p1,
                  txHash: event.transactionHash! as Hash,
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
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<
  channelDeposit.success | channelWithdrawn | channelClose.success | channelSettle.success
> =>
  action$.pipe(
    filter(isActionOf(channelMonitor)),
    groupBy(action => `${action.payload.id}#${action.meta.partner}@${action.meta.tokenNetwork}`),
    mergeMap(grouped$ =>
      grouped$.pipe(
        exhaustMap(action => {
          const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);

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
            mergeMap(function*(data) {
              if (isEvent<ChannelNewDepositEvent>(depositFilter, data)) {
                const [id, participant, totalDeposit, event] = data;
                yield channelDeposit.success(
                  {
                    id: id.toNumber(),
                    participant,
                    totalDeposit,
                    txHash: event.transactionHash! as Hash,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelWithdrawEvent>(withdrawFilter, data)) {
                const [id, participant, totalWithdraw, event] = data;
                yield channelWithdrawn(
                  {
                    id: id.toNumber(),
                    participant,
                    totalWithdraw,
                    txHash: event.transactionHash! as Hash,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelClosedEvent>(closedFilter, data)) {
                const [id, participant, , , event] = data;
                yield channelClose.success(
                  {
                    id: id.toNumber(),
                    participant,
                    closeBlock: event.blockNumber!,
                    txHash: event.transactionHash! as Hash,
                  },
                  action.meta,
                );
              } else if (isEvent<ChannelSettledEvent>(settledFilter, data)) {
                const [id, , , , , event] = data;
                yield channelSettle.success(
                  {
                    id: id.toNumber(),
                    settleBlock: event.blockNumber!,
                    txHash: event.transactionHash! as Hash,
                  },
                  action.meta,
                );
              }
            }),
            // takeWhile tends to broad input to generic Action. We need to narrow it explicitly
            takeWhile<
              | channelDeposit.success
              | channelWithdrawn
              | channelClose.success
              | channelSettle.success
            >(negate(isActionOf(channelSettle.success)), true),
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
  { signer, address, main, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelOpen.failure> =>
  action$.pipe(
    filter(isActionOf(channelOpen.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { settleTimeout, subkey: configSubkey }]) => {
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(action.meta.tokenNetwork),
        onchainSigner,
      );
      const channelState = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
        'state',
      ]);
      // proceed only if channel is in 'opening' state, set by this action
      if (channelState !== ChannelState.opening)
        return of(
          channelOpen.failure(new Error(`Invalid channel state: ${channelState}`), action.meta),
        );

      // send openChannel transaction !!!
      return from(
        tokenNetworkContract.functions.openChannel(
          address,
          action.meta.partner,
          action.payload.settleTimeout ?? settleTimeout,
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
        // will then emit the channelOpen.failure action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelOpen.failure(error, action.meta))),
      );
    }),
  );

/**
 * When we see a new ChannelOpenedAction event, starts monitoring channel
 *
 * @param action$ - Observable of channelOpen.success actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of channelMonitor actions
 */
export const channelOpenedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<channelMonitor> =>
  action$.pipe(
    filter(isActionOf(channelOpen.success)),
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
      channelMonitor(
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
 *
 * @param action$ - Observable of channelDeposit.request actions
 * @param state$ - Observable of RaidenStates
 * @param address,getTokenContract,getTokenNetworkContract - RaidenEpicDeps members
 * @returns Observable of channelDeposit.failure actions
 */
export const channelDepositEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { signer, address, main, getTokenContract, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelDeposit.failure> =>
  action$.pipe(
    filter(isActionOf(channelDeposit.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const token = findKey(state.tokens, tn => tn === action.meta.tokenNetwork) as
        | Address
        | undefined;
      if (!token) {
        const error = new Error(`token for tokenNetwork "${action.meta.tokenNetwork}" not found`);
        return of(channelDeposit.failure(error, action.meta));
      }
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(action.meta.tokenNetwork),
        onchainSigner,
      );
      const channel: Channel = get(state.channels, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (!channel || channel.state !== ChannelState.open || channel.id === undefined) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${action.meta.partner}" not found or not in 'open' state`,
        );
        return of(channelDeposit.failure(error, action.meta));
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
          // will then emit the channelDeposit.failure action instead
          mergeMapTo(EMPTY),
          catchError(error => of(channelDeposit.failure(error, action.meta))),
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
  { signer, address, main, network, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelClose.failure> =>
  action$.pipe(
    filter(isActionOf(channelClose.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload?.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(action.meta.tokenNetwork),
        onchainSigner,
      );
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
        return of(channelClose.failure(error, action.meta));
      }
      const channelId = channel.id;

      const balanceHash = HashZero as Hash,
        nonce = Zero as UInt<8>,
        additionalHash = HashZero as Hash,
        nonClosingSignature = hexlify(SignatureZero) as Signature;

      // TODO: enable this after we're able to receive transfers
      // if (channel.partner.balanceProof) {
      //   balanceHash = createBalanceHash(
      //     channel.partner.balanceProof.transferredAmount,
      //     channel.partner.balanceProof.lockedAmount,
      //     channel.partner.balanceProof.locksroot,
      //   );
      //   nonce = channel.partner.balanceProof.nonce;
      //   additionalHash = channel.partner.balanceProof.messageHash;
      //   nonClosingSignature = channel.partner.balanceProof.signature;
      // }

      const closingMessage = concat([
        encode(action.meta.tokenNetwork, 20),
        encode(network.chainId, 32),
        encode(1, 32), // raiden_contracts.constants.MessageTypeId.BALANCE_PROOF
        encode(channelId, 32),
        encode(balanceHash, 32),
        encode(nonce, 32),
        encode(additionalHash, 32),
        encode(nonClosingSignature, 65), // partner's signature for this balance proof
      ]); // UInt8Array of 277 bytes

      // sign counter balance proof (while we don't receive transfers yet, it's always zero),
      // then send closeChannel transaction with our signature
      return from(signer.signMessage(closingMessage) as Promise<Signature>).pipe(
        mergeMap(closingSignature =>
          tokenNetworkContract.functions.closeChannel(
            channelId,
            action.meta.partner,
            address,
            balanceHash,
            nonce,
            additionalHash,
            nonClosingSignature,
            closingSignature,
          ),
        ),
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
        // will then emit the channelClose.failure action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelClose.failure(error, action.meta))),
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
  { signer, address, main, getTokenNetworkContract, config$ }: RaidenEpicDeps,
): Observable<channelSettle.failure> =>
  action$.pipe(
    filter(isActionOf(channelSettle.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload?.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(action.meta.tokenNetwork),
        onchainSigner,
      );
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
        return of(channelSettle.failure(error, action.meta));
      }
      const channelId = channel.id;

      const zeroBalanceProof = {
        transferredAmount: Zero as UInt<32>,
        lockedAmount: Zero as UInt<32>,
        locksroot: HashZero as Hash,
      };
      let part1 = {
          address: action.meta.partner,
          ...(channel.partner.balanceProof || zeroBalanceProof),
        },
        part2 = {
          address,
          ...(channel.own.balanceProof || zeroBalanceProof),
        };
      if (channel.isFirstParticipant) [part1, part2] = [part2, part1];

      // send settleChannel transaction
      return from(
        tokenNetworkContract.functions.settleChannel(
          channelId,
          part1.address,
          part1.transferredAmount,
          part1.lockedAmount,
          part1.locksroot,
          part2.address,
          part2.transferredAmount,
          part2.lockedAmount,
          part2.locksroot,
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
        // will then emit the channelSettle.failure action instead
        mergeMapTo(EMPTY),
        catchError(error => of(channelSettle.failure(error, action.meta))),
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
