import { combineEpics, ofType, ActionsObservable } from 'redux-observable';
import { Observable, of, merge, pipe, UnaryFunction, from } from 'rxjs';
import {
  catchError,
  filter,
  ignoreElements,
  map,
  mergeAll,
  mergeMap,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { get } from 'lodash';

import { Event } from 'ethers/contract';
import { AddressZero } from 'ethers/constants';

import { fromEthersEvent, getEventsStream } from '../utils';
import { RaidenEpicDeps } from '../types';
import { RaidenState, ChannelState } from './state';
import {
  RaidenActionType,
  RaidenActions,

  ChannelOpenAction,
  ChannelOpenedAction,
  TokenMonitorAction,
  TokenMonitoredAction,
  TokenMonitorActionFailed,

  newBlock,
  channelOpened,
  channelOpenFailed,
  tokenMonitored,
  tokenMonitorFailed,
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
 * This epic fires once unconditionally (upon subscription), register blockNumber listener and
 * keeps firing NewBlockAction then
 */
const blockNumberEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<RaidenActions> =>
of(1).pipe(
  switchMap(() => fromEthersEvent<number>(provider, 'block')),
  map(newBlock),
)


const channelOpenEpic = (
  action$: ActionsObservable<RaidenActions>,
  state$: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<RaidenActions> =>
action$.pipe(
  ofType<RaidenActions, ChannelOpenAction>(RaidenActionType.CHANNEL_OPEN),
  withLatestFrom(state$),
  filter(([action, state]) =>  // proceed only if channel is in 'opening' state, set by this action
    get(
      state,
      ['tokenNetworks', action.tokenNetwork, action.partner, 'state'],
    ) === ChannelState.opening),
  mergeMap(([action, state]) => {
    const tokenNetwork = getTokenNetworkContract(action.tokenNetwork);

    // send openChannel transaction !!!
    return from(tokenNetwork.functions.openChannel(
      state.address, action.partner, action.settleTimeout,
    )).pipe(
      mergeMap(async (tx) => ({ receipt: await tx.wait(), tx })),
      map(({receipt, tx}) => {
        if (!receipt.status)
          throw new Error(`Transaction "${tx.hash}" failed`);
        return tx.hash;
      }),
      // if succeeded, return a empty/completed observable
      // actual ChannelOpenedAction will be detected and handled by tokenMonitorEpic
      // if any error happened on tx call/pipeline, mergeMap below won't be hit, and catchError
      // will then emit the channelOpenFailed action instead
      mergeMap(() => of<ChannelOpenedAction>()),
      catchError(error => of(channelOpenFailed(action.tokenNetwork, action.partner, error))),
    );
  }),
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
  {
    registryContract,
    getTokenNetworkContract,
    contractsInfo,
  }: RaidenEpicDeps,
): Observable<TokenMonitoredAction | TokenMonitorActionFailed | ChannelOpenedAction> =>
action$.pipe(
  ofType<RaidenActions, TokenMonitorAction>(RaidenActionType.TOKEN_MONITOR),
  withLatestFrom(state$),
  mergeMap(([action, state]) => {
    // output$ will always contain first the corresponding TokenMonitorAction.
    // if first time on this session for this token, it'll also return a merged
    // stream of events for the TokenNetwork contract
    let output$: Observable<TokenMonitoredAction | TokenMonitorActionFailed | ChannelOpenedAction>;
    // type of elements emitted by getEventsStream (past and new events coming from contract)
    type ChannelOpenedEvent = [number, string, string, number, Event];

    // operator to convert the parameters of contract.on callbacks to ChannelOpenedAction
    const makeChannelOpenedAction = (
      tokenNetworkAddress: string,
    ): UnaryFunction<Observable<ChannelOpenedEvent>, Observable<ChannelOpenedAction>> =>
    pipe(
      filter(([, p1, p2]: ChannelOpenedEvent) => [p1, p2].indexOf(state.address) >= 0),
      map(([id, p1, p2, settleTimeout, event]) =>
        channelOpened(
          tokenNetworkAddress,
          state.address === p1 ? p2 : p1,
          id,
          settleTimeout,
          event.blockNumber || 0,  // these parameters should always be set in event
          event.transactionHash || '',
        )
      ),
    )

    const lastSeenBlock$ = state$.pipe(map(state => state.blockNumber));
    // if tokenNetwork already in state mapping, use it
    if (action.token in state.token2tokenNetwork) {
      const tokenNetwork = getTokenNetworkContract(state.token2tokenNetwork[action.token]);
      output$ = merge(
        of(tokenMonitored(action.token, tokenNetwork.address)),
        // if already subscribed, this will complete immediatelly, so noop
        // else subscribe to the stream of events, but don't set fromBlock,
        // so only events since provider.resetEventsBlock are polled from now on
        getEventsStream<ChannelOpenedEvent>(
          tokenNetwork,
          [  // filters for ChannelOpened by us and with us
            tokenNetwork.filters.ChannelOpened(null, state.address, null, null),
            tokenNetwork.filters.ChannelOpened(null, null, state.address, null),
          ],
        ).pipe(makeChannelOpenedAction(tokenNetwork.address)),
      );
    } else {
      // call contract's method to fetch tokenNetwork for token
      output$ = of(1).pipe(
        switchMap(async () => {  // switch/mergeMap can receive Promise as return of callback
          let tokenNetworkAddress: string;
          try {
            tokenNetworkAddress = await registryContract.functions
              .token_to_token_networks(action.token);
            if (!tokenNetworkAddress || tokenNetworkAddress === AddressZero)
              throw new Error(`No valid tokenNetwork for ${action.token}`);
          } catch(err) {
            return of(tokenMonitorFailed(action.token, err));
          }
          const tokenNetwork = getTokenNetworkContract(tokenNetworkAddress);
          const channelOpened$ = getEventsStream<ChannelOpenedEvent>(
            tokenNetwork,
            [
              tokenNetwork.filters.ChannelOpened(null, state.address, null, null),
              tokenNetwork.filters.ChannelOpened(null, null, state.address, null),
            ],
            // fetch TokenNetwork's pastEvents since registry deployment as fromBlock$
            of(contractsInfo.TokenNetworkRegistry.block_number),
            lastSeenBlock$,
          ).pipe(makeChannelOpenedAction(tokenNetworkAddress));

          return merge(
            of(tokenMonitored(action.token, tokenNetworkAddress, /*first=*/true)),
            channelOpened$,
          );
        }),
        mergeAll(),
      );
    }
    return output$;
  }),
);


export const raidenEpics = combineEpics<RaidenActions, RaidenActions, RaidenState, RaidenEpicDeps>(
  stateOutputEpic,
  actionOutputEpic,
  blockNumberEpic,
  channelOpenEpic,
  tokenMonitorEpic,
);
