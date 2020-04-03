import get from 'lodash/fp/get';
import set from 'lodash/fp/set';
import unset from 'lodash/fp/unset';
import getOr from 'lodash/fp/getOr';
import { Zero } from 'ethers/constants';

import { UInt } from '../utils/types';
import { Reducer, createReducer, isActionOf } from '../utils/actions';
import { partialCombineReducers } from '../utils/redux';
import { RaidenState, initialState } from '../state';
import { RaidenAction, ConfirmableActions } from '../actions';
import {
  channelClose,
  channelDeposit,
  channelOpen,
  channelSettle,
  channelSettleable,
  newBlock,
  tokenMonitored,
  channelWithdrawn,
} from './actions';
import { Channel, ChannelState } from './state';

// state.blockNumber specific reducer, handles only newBlock action
const blockNumber = createReducer(initialState.blockNumber).handle(
  newBlock,
  ({}, { payload }) => payload.blockNumber,
);

// state.tokens specific reducer, handles only tokenMonitored action
const tokens = createReducer(initialState.tokens).handle(
  tokenMonitored,
  (state, { payload: { token, tokenNetwork } }) => ({ ...state, [token]: tokenNetwork }),
);

// Reducers for different actions
function channelOpenRequestReducer(
  state: RaidenState['channels'],
  action: channelOpen.request,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  if (get(path, state)) return state; // there's already a channel with partner
  const channel: Channel = {
    state: ChannelState.opening,
    own: { deposit: Zero as UInt<32> },
    partner: { deposit: Zero as UInt<32> },
  };
  return set(path, channel, state);
}

function channelOpenSuccessReducer(
  state: RaidenState['channels'],
  action: channelOpen.success,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  // ignore if older than currently set channel, or unconfirmed or removed
  if (
    getOr(0, [...path, 'openBlock'], state) >= action.payload.txBlock ||
    !action.payload.confirmed
  )
    return state;
  const channel: Channel = {
    state: ChannelState.open,
    own: { deposit: Zero as UInt<32> },
    partner: { deposit: Zero as UInt<32> },
    id: action.payload.id,
    settleTimeout: action.payload.settleTimeout,
    isFirstParticipant: action.payload.isFirstParticipant,
    openBlock: action.payload.txBlock,
  };
  return set(path, channel, state);
}

function channelOpenFailureReducer(
  state: RaidenState['channels'],
  action: channelOpen.failure,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  if (get([...path, 'state'], state) !== ChannelState.opening) return state;
  return unset(path, state);
}

function channelUpdateOnchainBalanceStateReducer(
  state: RaidenState['channels'],
  action: channelDeposit.success | channelWithdrawn,
): RaidenState['channels'] {
  // ignore event if unconfirmed or removed
  if (!action.payload.confirmed) return state;
  const path = [action.meta.tokenNetwork, action.meta.partner];
  let channel: Channel | undefined = get(path, state);
  if (!channel || channel.state !== ChannelState.open || channel.id !== action.payload.id)
    return state;

  const key = channelWithdrawn.is(action) ? 'withdraw' : 'deposit';
  const total = channelWithdrawn.is(action)
    ? action.payload.totalWithdraw
    : action.payload.totalDeposit;

  const isPartner = action.payload.participant === action.meta.partner;
  const channelSide = isPartner ? 'partner' : 'own';
  const channelEndData = isPartner ? channel.partner : channel.own;

  channel = {
    ...channel,
    [channelSide]: {
      ...channelEndData,
      [key]: total,
    },
  };

  return set(path, channel, state);
}

function channelCloseSuccessReducer(
  state: RaidenState['channels'],
  action: channelClose.success,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  let channel: Channel | undefined = get(path, state);
  if (
    !channel ||
    !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
    channel.id !== action.payload.id
  )
    return state;
  // even on non-confirmed action, already set channel state as closing, so it can't be used for new transfers
  if (action.payload.confirmed === undefined && channel.state === ChannelState.open)
    channel = { ...channel, state: ChannelState.closing };
  else if (action.payload.confirmed)
    channel = {
      ...channel,
      state: ChannelState.closed,
      closeBlock: action.payload.txBlock,
      closeParticipant: action.payload.participant,
    };
  else return state;
  return set(path, channel, state);
}

function channelUpdateStateReducer(
  state: RaidenState['channels'],
  action: channelClose.request | channelSettle.request | channelSettleable,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  let channel: Channel | undefined = get(path, state);
  if (!channel) return state;
  if (channelClose.request.is(action) && channel.state === ChannelState.open) {
    channel = { ...channel, state: ChannelState.closing };
  } else if (channelSettle.request.is(action) && channel.state === ChannelState.settleable) {
    channel = { ...channel, state: ChannelState.settling };
  } else if (channelSettleable.is(action) && channel.state === ChannelState.closed) {
    channel = { ...channel, state: ChannelState.settleable };
  } else {
    return state;
  }
  return set(path, channel, state);
}

function channelSettleSuccessReducer(
  state: RaidenState['channels'],
  action: channelSettle.success,
): RaidenState['channels'] {
  const path = [action.meta.tokenNetwork, action.meta.partner];
  const channel: Channel | undefined = get(path, state);
  if (
    !channel ||
    channel.state === ChannelState.opening ||
    channel.state === ChannelState.open ||
    channel.state === ChannelState.closing ||
    channel.id !== action.payload.id
  )
    return state;
  // even on non-confirmed action, already set channel as settling
  if (action.payload.confirmed === undefined && channel.state !== ChannelState.settling)
    return set(path, { ...channel, state: ChannelState.settling }, state);
  else if (action.payload.confirmed) return unset(path, state);
  else return state;
}

// handles all channel actions and requests
const channels: Reducer<RaidenState['channels'], RaidenAction> = createReducer(
  initialState.channels,
)
  .handle(channelOpen.request, channelOpenRequestReducer)
  .handle(channelOpen.success, channelOpenSuccessReducer)
  .handle(channelOpen.failure, channelOpenFailureReducer)
  .handle([channelDeposit.success, channelWithdrawn], channelUpdateOnchainBalanceStateReducer)
  .handle(
    [channelClose.request, channelSettleable, channelSettle.request],
    channelUpdateStateReducer,
  )
  .handle(channelClose.success, channelCloseSuccessReducer)
  .handle(channelSettle.success, channelSettleSuccessReducer);

const pendingTxs: Reducer<RaidenState['pendingTxs'], RaidenAction> = (
  state = initialState.pendingTxs,
  action: RaidenAction,
): RaidenState['pendingTxs'] => {
  // filter out non-ConfirmableActions's
  if (!isActionOf(ConfirmableActions, action)) return state;
  // if confirmed==undefined, add action to state
  else if (action.payload.confirmed === undefined) return [...state, action];
  // else (either confirmed or removed), remove from state
  else {
    const newState = state.filter(
      (a) => a.type !== action.type || action.payload.txHash !== a.payload.txHash,
    );
    if (newState.length !== state.length) return newState;
    return state;
  }
};

/**
 * Nested/combined reducer for channels
 * blockNumber, tokens & channels reducers get its own slice of the state, corresponding to the
 * name of the reducer. channels root reducer instead must be handled the complete state instead,
 * so it compose the output with each key/nested/combined state.
 */
export const channelsReducer = partialCombineReducers(
  { blockNumber, tokens, channels, pendingTxs },
  initialState,
);
