import { Observable, from, of, EMPTY } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  mergeMapTo,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { isActionOf, ActionType } from 'typesafe-actions';
import { get, findKey } from 'lodash';

import { HashZero, Zero } from 'ethers/constants';

import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../';
import { RaidenState, Channel, ChannelState } from '../state';
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
} from '../actions';
import { SignatureZero } from '../../constants';

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
      const channelState = get(state.tokenNetworks, [
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
      const channel: Channel | undefined = get(state.tokenNetworks, [
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
      const token = findKey(state.token2tokenNetwork, tn => tn === action.meta.tokenNetwork);
      if (!token) {
        const error = new Error(`token for tokenNetwork "${action.meta.tokenNetwork}" not found`);
        return of(channelDepositFailed(error, action.meta));
      }
      const tokenContract = getTokenContract(token);
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
      const channel: Channel = get(state.tokenNetworks, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (!channel || channel.state !== ChannelState.open || channel.id === undefined) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${
            action.meta.partner
          }" not found or not in 'open' state`,
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
              state.tokenNetworks[action.meta.tokenNetwork][action.meta.partner].totalDeposit.add(
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
                `tokenNetwork "${action.meta.tokenNetwork}" setTotalDeposit transaction "${
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
      const channel: Channel = get(state.tokenNetworks, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (
        !channel ||
        !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${
            action.meta.partner
          }" not found or not in 'open' or 'closing' state`,
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
              `tokenNetwork "${action.meta.tokenNetwork}" closeChannel transaction "${
                tx.hash
              }" failed`,
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
      const channel: Channel | undefined = get(state.tokenNetworks, [
        action.meta.tokenNetwork,
        action.meta.partner,
      ]);
      if (
        !channel ||
        !(channel.state === ChannelState.settleable || channel.state === ChannelState.settling) ||
        !channel.id
      ) {
        const error = new Error(
          `channel for "${action.meta.tokenNetwork}" and "${
            action.meta.partner
          }" not found or not in 'settleable' or 'settling' state`,
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
              `tokenNetwork "${action.meta.tokenNetwork}" settleChannel transaction "${
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
        catchError(error => of(channelSettleFailed(error, action.meta))),
      );
    }),
  );
