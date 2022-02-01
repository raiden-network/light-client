import { AddressZero, One, Zero } from '@ethersproject/constants';

import type { RaidenAction } from '../actions';
import { ConfirmableAction } from '../actions';
import type { RaidenState } from '../state';
import { initialState } from '../state';
import { transferSecretRegister } from '../transfers/actions';
import { Direction } from '../transfers/state';
import type { Reducer } from '../utils/actions';
import { createReducer } from '../utils/actions';
import { partialCombineReducers } from '../utils/redux';
import type { Address, Hash, UInt } from '../utils/types';
import {
  channelClose,
  channelDeposit,
  channelOpen,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
  newBlock,
  tokenMonitored,
} from './actions';
import type { Channel, ChannelEnd } from './state';
import { ChannelState } from './state';
import type { Lock } from './types';
import { BalanceProofZero } from './types';
import { channelKey, channelUniqueKey } from './utils';

// state.blockNumber specific reducer, handles only newBlock action
const blockNumber = createReducer(initialState.blockNumber).handle(
  newBlock,
  ({}, { payload }) => payload.blockNumber,
);

// state.tokens specific reducer, handles only tokenMonitored action
const tokens = createReducer(initialState.tokens).handle(
  tokenMonitored,
  (state, { payload: { token, tokenNetwork } }) =>
    state[token] === tokenNetwork ? state : { ...state, [token]: tokenNetwork },
);

function removeAction(pendingTxs: readonly ConfirmableAction[], action: ConfirmableAction) {
  return pendingTxs.filter(
    (a) => a.type !== action.type || action.payload.txHash !== a.payload.txHash,
  );
}

const pendingTxs: Reducer<RaidenState['pendingTxs'], RaidenAction> = (
  state = initialState.pendingTxs,
  action: RaidenAction,
): RaidenState['pendingTxs'] => {
  // filter out non-ConfirmableActions's
  if (!ConfirmableAction.is(action)) return state;
  // if confirmed==undefined, deduplicate and add action to state
  else if (action.payload.confirmed === undefined) return [...removeAction(state, action), action];
  // else (either confirmed or removed), remove from state
  else {
    const newState = removeAction(state, action);
    if (newState.length !== state.length) return newState;
    return state;
  }
};

const emptyChannelEnd: ChannelEnd = {
  address: AddressZero as Address,
  deposit: Zero as UInt<32>,
  withdraw: Zero as UInt<32>,
  locks: [],
  balanceProof: BalanceProofZero,
  pendingWithdraws: [],
  nextNonce: One as UInt<8>,
};

function channelOpenSuccessReducer(state: RaidenState, action: channelOpen.success): RaidenState {
  const key = channelKey(action.meta);
  // ignore if older than currently set channel, or unconfirmed or removed
  const prevChannel = state.channels[key];
  if (
    (prevChannel?.openBlock ?? 0) >= action.payload.txBlock ||
    (prevChannel?.id ?? 0) >= action.payload.id ||
    !action.payload.confirmed
  )
    return state;
  const channel: Channel = {
    _id: channelUniqueKey({ ...action.meta, id: action.payload.id }),
    id: action.payload.id,
    state: ChannelState.open,
    token: action.payload.token,
    tokenNetwork: action.meta.tokenNetwork,
    isFirstParticipant: action.payload.isFirstParticipant,
    openBlock: action.payload.txBlock,
    own: {
      ...emptyChannelEnd,
      address: state.address,
    },
    partner: {
      ...emptyChannelEnd,
      address: action.meta.partner,
    },
  };
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function channelUpdateOnchainBalanceStateReducer(
  state: RaidenState,
  action: channelDeposit.success | channelWithdrawn,
): RaidenState {
  // ignore event if unconfirmed or removed
  if (!action.payload.confirmed) return state;
  const key = channelKey(action.meta);
  let channel = state.channels[key];
  if (channel?.state !== ChannelState.open || channel.id !== action.payload.id) return state;

  const end = action.payload.participant === channel.partner.address ? 'partner' : 'own';
  const [prop, total, pendingWithdraws] = channelWithdrawn.is(action)
    ? [
        'withdraw' as const,
        action.payload.totalWithdraw,
        channel[end].pendingWithdraws.filter((req) =>
          req.total_withdraw.gt(action.payload.totalWithdraw),
        ), // on-chain withdraw clears <= withdraw messages, including the confirmed one
      ]
    : ['deposit' as const, action.payload.totalDeposit, channel[end].pendingWithdraws];

  if (total.lte(channel[end][prop])) return state; // ignore if past event

  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      [prop]: total,
      pendingWithdraws,
    },
  };
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function channelCloseSuccessReducer(
  state: RaidenState,
  action: channelClose.success,
): RaidenState {
  const key = channelKey(action.meta);
  let channel = state.channels[key];
  if (channel?.id !== action.payload.id) return state;
  // even on non-confirmed action, already set channel state as closing, so it can't be used for new transfers
  if (action.payload.confirmed === undefined && channel.state === ChannelState.open)
    channel = { ...channel, state: ChannelState.closing };
  else if (!('closeBlock' in channel) && action.payload.confirmed)
    channel = {
      ...channel,
      state: ChannelState.closed,
      closeBlock: action.payload.txBlock,
      closeParticipant: action.payload.participant,
    };
  else return state;
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function channelUpdateStateReducer(
  state: RaidenState,
  action: channelClose.request | channelClose.failure | channelSettle.request | channelSettleable,
): RaidenState {
  const key = channelKey(action.meta);
  let channel = state.channels[key];
  if (!channel) return state;
  if (channelClose.request.is(action) && channel.state === ChannelState.open) {
    channel = { ...channel, state: ChannelState.closing };
  } else if (channelClose.failure.is(action) && channel.state === ChannelState.closing) {
    channel = { ...channel, state: ChannelState.open }; // rollback to open
  } else if (channelSettle.request.is(action) && channel.state === ChannelState.settleable) {
    channel = { ...channel, state: ChannelState.settling };
  } else if (channelSettleable.is(action) && channel.state === ChannelState.closed) {
    channel = { ...channel, state: ChannelState.settleable };
  } else {
    return state;
  }
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function channelSettleSuccessReducer(
  state: RaidenState,
  action: channelSettle.success,
): RaidenState {
  const key = channelKey(action.meta);
  const channel = state.channels[key];
  if (channel?.id !== action.payload.id) return state;

  // closeBlock,closeParticipant get defaults if channel was coop-settled
  const closeInfo = {
    closeBlock: 'closeBlock' in channel ? channel.closeBlock : 0,
    closeParticipant:
      'closeParticipant' in channel ? channel.closeParticipant : (AddressZero as Address),
  };

  if (action.payload.confirmed === undefined && channel.state !== ChannelState.settling)
    // on non-confirmed action, set channel as settling
    return {
      ...state,
      channels: {
        ...state.channels,
        [key]: {
          ...channel,
          ...closeInfo,
          state: ChannelState.settling,
        },
      },
    };
  else if (action.payload.confirmed) {
    const { [key]: _, ...channels } = state.channels; // pop [key] channel out of state.channels
    return {
      ...state,
      channels, // replace channels without [key]
      oldChannels: {
        // persist popped channel on oldChannels with augmented channelKey
        ...state.oldChannels,
        [channelUniqueKey(channel)]: {
          ...channel,
          ...closeInfo,
          state: ChannelState.settled,
          settleBlock: action.payload.txBlock,
        },
      },
    };
  }
  return state;
}

/* Immutably mark locks as registed; returns reference to previous array if nothing changes */
function markLocksAsRegistered(
  locks: readonly Lock[],
  secrethash: Hash,
  registeredTimestamp: number,
): readonly Lock[] {
  let changed = false;
  const newLocks = locks.map((lock) => {
    if (
      lock.secrethash !== secrethash ||
      lock.registered ||
      lock.expiration.lte(registeredTimestamp)
    )
      return lock;
    changed = true;
    return { ...lock, registered: true as const };
  });
  if (changed) return newLocks;
  return locks;
}

function channelLockRegisteredReducer(
  state: RaidenState,
  action: transferSecretRegister.success,
): RaidenState {
  // now that secret is stored in transfer, if it's a confirmed on-chain registration,
  // also update channel's lock to reflect it
  if (!action.payload.confirmed) return state;

  const end = action.meta.direction === Direction.SENT ? 'own' : 'partner';
  // iterate over channels and update any matching lock
  for (const [key, channel] of Object.entries(state.channels)) {
    const newLocks = markLocksAsRegistered(
      channel[end].locks,
      action.meta.secrethash,
      action.payload.txTimestamp,
    );
    if (newLocks === channel[end].locks) continue;
    // only update state if locks changed
    state = {
      ...state,
      channels: {
        ...state.channels,
        [key]: {
          ...channel,
          [end]: {
            ...channel[end],
            locks: newLocks,
          },
        },
      },
    };
  }
  return state;
}

// handles actions which reducers need RaidenState
const completeReducer = createReducer(initialState)
  .handle(channelOpen.success, channelOpenSuccessReducer)
  .handle([channelDeposit.success, channelWithdrawn], channelUpdateOnchainBalanceStateReducer)
  .handle(
    [channelClose.request, channelClose.failure, channelSettleable, channelSettle.request],
    channelUpdateStateReducer,
  )
  .handle(channelClose.success, channelCloseSuccessReducer)
  .handle(channelSettle.success, channelSettleSuccessReducer)
  .handle(transferSecretRegister.success, channelLockRegisteredReducer);

/**
 * Nested/combined reducer for channels
 * blockNumber, tokens & pendingTxs reducers get its own slice of the state, corresponding to the
 * name of the reducer. channels root reducer instead must be handled the complete state instead,
 * so it compose the output with each key/nested/combined state.
 */
const partialReducer = partialCombineReducers<RaidenState, RaidenAction>(
  { blockNumber, tokens, pendingTxs },
  initialState,
);
/**
 * channelsReducer is a reduce-reducers like reducer; in contract with combineReducers, which
 * gives just a specific slice of the state to the reducer (like blockNumber above, which receives
 * only blockNumber), it actually act as a normal reducer by getting the whole state, but can do
 * it over several reducers, passing the output of one as the input for next
 *
 * @param state - previous root RaidenState
 * @param action - RaidenAction to try to handle
 * @returns - new RaidenState
 */
const channelsReducer = (state: RaidenState = initialState, action: RaidenAction) =>
  [partialReducer, completeReducer].reduce((s, reducer) => reducer(s, action), state);
export default channelsReducer;
