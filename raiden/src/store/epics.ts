import { combineEpics, ofType, ActionsObservable } from 'redux-observable';
import { Observable, defer, from, of, merge } from 'rxjs';
import {
  catchError,
  filter,
  ignoreElements,
  map,
  mergeMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { get, findKey } from 'lodash';

import { Event } from 'ethers/contract';
import { AddressZero } from 'ethers/constants';

import { fromEthersEvent, getEventsStream } from '../utils';
import { RaidenEpicDeps } from '../types';
import { RaidenState, Channel, ChannelState } from './state';
import {
  RaidenActionType,
  RaidenActions,

  RaidenInitAction,
  NewBlockAction,
  TokenMonitorAction,
  TokenMonitoredAction,
  TokenMonitorActionFailed,
  ChannelOpenAction,
  ChannelOpenedAction,
  ChannelOpenActionFailed,
  ChannelMonitorAction,
  ChannelDepositAction,
  ChannelDepositedAction,
  ChannelDepositActionFailed,

  newBlock,
  tokenMonitored,
  tokenMonitorFailed,
  channelOpened,
  channelOpenFailed,
  channelMonitor,
  channelDeposited,
  channelDepositFailed,
} from './actions';


/**
 * This epic simply pipes all states to stateOutput$ subject injected as dependency
 */
const stateOutputEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { stateOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
state$.pipe(
  tap(
    value => stateOutput$.next(value),
    err => stateOutput$.error(err),
    () => stateOutput$.complete(),
  ),
  ignoreElements(),
);


/**
 * This epic simply pipes all actions to actionOutput$ subject injected as dependency
 */
const actionOutputEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { actionOutput$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  action$.pipe(
    tap(
      value => actionOutput$.next(value),
      err => actionOutput$.error(err),
      () => actionOutput$.complete(),
    ),
    ignoreElements(),
  );


/**
 * Initialization actions
 * - NewBlock events polling
 * - monitoring TokenNetworks
 * - monitoring open Channels
 */
const raidenInitializationEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<NewBlockAction | TokenMonitoredAction | ChannelMonitorAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    withLatestFrom(state$),
    mergeMap(([, state]) => merge(
      // newBlock events
      fromEthersEvent<number>(provider, 'block').pipe(map(newBlock)),
      // monitor tokens
      from(Object.entries(state.token2tokenNetwork)).pipe(
        map(([token, tokenNetwork]) => tokenMonitored(token, tokenNetwork)),
      ),
      // monitor open channels
      from(Object.entries(state.tokenNetworks)).pipe(
        mergeMap(([tokenNetwork, obj]) =>
          from(Object.entries(obj)).pipe(
            filter(([, channel]) =>
              channel.state !== ChannelState.open && channel.id !== undefined),
            // typescript doesn't understand above filter guarantees id below will be set
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            map(([partner, channel]) => channelMonitor(tokenNetwork, partner, channel.id!)),
          )
        ),
      ),
    )),
  );


/*
 * This TokenMonitorAction request can happen in 3 cases:
 * - First time ever for this token, so the token isn't in the state mapping:
 *      Fetch the tokenNetwork from registry contract and return a success TokenMonitoredAction
 *      response, with `first=true` property. This will also set the state mapping.
 *      Besides this, also merge a stream of past events fetched since registry deployment up to
 *      provider.resetEventsBlock-1, plus stream of new events since provider.resetEventsBlock
 *      up to latest.
 *      If this request fails, an error TokenMonitorActionFailed is emitted instead.
 * - First time on this session, but already requested in the past (already in the state mapping)
 *      Then, return the success TokenMonitoredAction from state, plus register and merge
 *      the stream of new events since provider.resetEventsBlock (past events were already handled
 *      on above case)
 * - Already seen in this session:
 *      In this case, we already registered to the stream of events, the one returned here
 *      completes immediatelly (to avoid double-register events), and then just the success
 *      TokenMonitoredAction is emitted as a reply to this request
 */
const tokenMonitorEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { registryContract }: RaidenEpicDeps,
): Observable<TokenMonitoredAction | TokenMonitorActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, TokenMonitorAction>(RaidenActionType.TOKEN_MONITOR),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      // if tokenNetwork already in state mapping, use it
      if (action.token in state.token2tokenNetwork) {
        return of(tokenMonitored(action.token, state.token2tokenNetwork[action.token]));
      } else {
        // call contract's method to fetch tokenNetwork for token
        return from(
          registryContract.functions.token_to_token_networks(action.token)
        ).pipe(
          map(address => {
            if (!address || address === AddressZero)
              throw new Error(`No valid tokenNetwork for ${action.token}`);
            return tokenMonitored(action.token, address, /*first=*/true);
          }),
          catchError(error => of(tokenMonitorFailed(action.token, error)))
        );
      }
    }),
  );


/**
 * Monitor a token network for events
 * When this actions goes through (be it because of raidenInit call of previously monitored
 * tokenNetwork, or because client wants to interact with a new token network through
 * TokenMonitorAction), iff we're not yet subscribed to events on this token network,
 * subscribe to events and emit respective actions to the stream. Currently:
 * - ChannelOpened events with us or by us
 */
const tokenMonitoredEventsEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  {
    address,
    getTokenNetworkContract,
    contractsInfo,
  }: RaidenEpicDeps,
): Observable<ChannelOpenedAction> =>
  action$.pipe(
    ofType<RaidenActions, TokenMonitoredAction>(RaidenActionType.TOKEN_MONITORED),
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, partner1, partner2, settleTimeout, Event]
      type ChannelOpenedEvent = [number, string, string, number, Event];

      const filters = [
        tokenNetworkContract.filters.ChannelOpened(null, address, null, null),
        tokenNetworkContract.filters.ChannelOpened(null, null, address, null),
      ];

      // at subscription time, if there's already a filter, skip (return completed observable)
      return defer(() => tokenNetworkContract.listenerCount(filters[0])
        ? of<ChannelOpenedAction>()  // completed/empty observable as return
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
              id,
              settleTimeout,
              event.blockNumber || 0,  // these parameters should always be set in event
              event.transactionHash || '',
            )
          ),
        )
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
const channelOpenEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelOpenedAction | ChannelOpenActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelOpenAction>(RaidenActionType.CHANNEL_OPEN),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetwork = getTokenNetworkContract(action.tokenNetwork);
      const channelState = get(
        state.tokenNetworks,
        [action.tokenNetwork, action.partner, 'state'],
      );
      // proceed only if channel is in 'opening' state, set by this action
      if (channelState !== ChannelState.opening)
        return of(channelOpenFailed(
          action.tokenNetwork,
          action.partner,
          new Error(`Invalid channel state: ${channelState}`),
        ));

      // send openChannel transaction !!!
      return from(tokenNetwork.functions.openChannel(
        state.address, action.partner, action.settleTimeout,
      )).pipe(
        mergeMap(async (tx) => ({ receipt: await tx.wait(), tx })),
        map(({receipt, tx}) => {
          if (!receipt.status)
            throw new Error(`openChannel transaction "${tx.hash}" failed`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelOpenedAction will be detected and handled by tokenMonitoredEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelOpenFailed action instead
        mergeMap(() => of<ChannelOpenedAction>()),
        catchError(error => of(channelOpenFailed(action.tokenNetwork, action.partner, error))),
      );
    }),
  );


/**
 * When we see a new ChannelOpenedAction event, starts monitoring channel
 */
const channelOpenedEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { /*getTokenNetworkContract*/ }: RaidenEpicDeps,
): Observable<ChannelMonitorAction> =>
  action$.pipe(
    ofType<RaidenActions, ChannelOpenedAction>(RaidenActionType.CHANNEL_OPENED),
    withLatestFrom(state$),
    // proceed only if channel is in 'open' state and a deposit is required
    filter(([action, state]) => {
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      return channel && channel.state === ChannelState.open;
    }),
    map(([action]) => channelMonitor(
      action.tokenNetwork,
      action.partner,
      action.id,
      action.openBlock,  // fetch past events as well, if needed
    )),
  );


/**
 * Monitors a channel for channel Events
 * Can be called either at initialization time (for previously known channels on previously
 * monitored TokenNetwork) or by a new detected ChannelOpenedAction. On the later case,
 * also fetches events since Channel.openBlock.
 * Currently monitored events:
 * - ChannelNewDeposit, fires a ChannelDepositedAction
 */
const channelMonitorEventsEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelDepositedAction> =>
  action$.pipe(
    ofType<RaidenActions, ChannelMonitorAction>(RaidenActionType.CHANNEL_MONITOR),
    mergeMap(action => {
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);

      // type of elements emitted by getEventsStream (past and new events coming from contract)
      // [channelId, participant, totalDeposit, Event]
      type ChannelNewDepositEvent = [number, string, number, Event];

      const filters = [
        tokenNetworkContract.filters.ChannelNewDeposit(action.id, null, null),
      ];

      // at subscription time, if there's already a filter, skip (return completed observable)
      return defer(() => tokenNetworkContract.listenerCount(filters[0])
        ? of<ChannelDepositedAction>()  // completed/empty observable as return
        : getEventsStream<ChannelNewDepositEvent>(
          tokenNetworkContract,
          filters,
          // if channelMonitor triggered by ChannelOpenedAction,
          // fetch Channel's pastEvents since channelOpened blockNumber as fromBlock$
          action.fromBlock ? of(action.fromBlock) : undefined,
          action.fromBlock ? state$.pipe(map(state => state.blockNumber)) : undefined,
        ).pipe(
          map(([id, participant, totalDeposit, event]) =>
            channelDeposited(
              action.tokenNetwork,
              action.partner,
              id,
              participant,
              totalDeposit,
              event.transactionHash || '', // should always be defined
            )
          ),
        )
      );
    }),
  );


/**
 * A ChannelDeposit action requested by user
 * Needs to be called on a previously monitored channel. Calls Token.approve for TokenNetwork
 * and then set respective setTotalDeposit. If all tx go through successfuly, stop as
 * ChannelDeposited success action will instead be detected and reacted by
 * channelMonitorEventsEpic. If anything detectable goes wrong, fires a ChannelDepositActionFailed
 * instead
 */
const channelDepositEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, getTokenContract, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<ChannelDepositedAction | ChannelDepositActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, ChannelDepositAction>(RaidenActionType.CHANNEL_DEPOSIT),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const token = findKey(state.token2tokenNetwork, tn => tn === action.tokenNetwork);
      if (!token) {
        const error = new Error(`token for tokenNetwork "${action.tokenNetwork}" not found`);
        return of(channelDepositFailed(action.tokenNetwork, action.partner, error))
      }
      const tokenContract = getTokenContract(token);
      const tokenNetworkContract = getTokenNetworkContract(action.tokenNetwork);
      const channel: Channel = get(state.tokenNetworks, [action.tokenNetwork, action.partner]);
      if (!channel || channel.state !== ChannelState.open) {
        const error = new Error(`channel for "${action.tokenNetwork}" and "${action.partner}" `+
          `not found or not in 'open' state`);
        return of(channelDepositFailed(action.tokenNetwork, action.partner, error))
      }

      return from(
        tokenContract.functions.approve(action.tokenNetwork, action.deposit)  // send approve transaction
      ).pipe(
        mergeMap(async (tx) => ({ receipt: await tx.wait(), tx })),
        map(({receipt, tx}) => {
          if (!receipt.status)
            throw new Error(`token "${token}" approve transaction "${tx.hash}" failed`);
          return tx.hash;
        }),
        withLatestFrom(state$),
        mergeMap(([, state]) =>
          // send setTotalDeposit transaction
          tokenNetworkContract.functions.setTotalDeposit(
            action.id,
            address,
            get(
              state.tokenNetworks,
              [action.tokenNetwork, action.partner, 'totalDeposit'],
            ) + action.deposit,
            action.partner,
          )
        ),
        mergeMap(async (tx) => ({ receipt: await tx.wait(), tx })),
        map(({receipt, tx}) => {
          if (!receipt.status)
            throw new Error(`tokenNetwork "${action.tokenNetwork}" setTotalDeposit ` +
              `transaction "${tx.hash}" failed`);
          return tx.hash;
        }),
        // if succeeded, return a empty/completed observable
        // actual ChannelDepositedAction will be detected and handled by channelMonitorEventsEpic
        // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
        // will then emit the channelDepositFailed action instead
        mergeMap(() => of<ChannelDepositedAction>()),
        catchError(error =>
          of(channelDepositFailed(action.tokenNetwork, action.partner, error))
        ),
      );
    }),
  );


export const raidenEpics = combineEpics<RaidenActions, RaidenActions, RaidenState, RaidenEpicDeps>(
  raidenInitializationEpic,
  stateOutputEpic,
  actionOutputEpic,
  tokenMonitorEpic,
  tokenMonitoredEventsEpic,
  channelOpenEpic,
  channelOpenedEpic,
  channelMonitorEventsEpic,
  channelDepositEpic,
);
