import { Zero, AddressZero, HashZero } from 'ethers/constants';

import { UInt, Address, Hash } from '../utils/types';
import { Reducer, createReducer, isActionOf } from '../utils/actions';
import { partialCombineReducers } from '../utils/redux';
import { RaidenState, initialState } from '../state';
import { SignatureZero } from '../constants';
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
import { Channel, ChannelState, ChannelEnd } from './state';
import { channelKey } from './utils';

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

const emptyChannelEnd: ChannelEnd = {
  address: AddressZero as Address,
  deposit: Zero as UInt<32>,
  withdraw: Zero as UInt<32>,
  locks: [],
  balanceProof: {
    chainId: Zero as UInt<32>,
    tokenNetworkAddress: AddressZero as Address,
    channelId: Zero as UInt<32>,
    nonce: Zero as UInt<8>,
    transferredAmount: Zero as UInt<32>,
    lockedAmount: Zero as UInt<32>,
    locksroot: HashZero as Hash,
    additionalHash: HashZero as Hash,
    signature: SignatureZero,
  },
};

function channelOpenSuccessReducer(state: RaidenState, action: channelOpen.success): RaidenState {
  const key = channelKey(action.meta);
  // ignore if older than currently set channel, or unconfirmed or removed
  if ((state.channels[key]?.openBlock ?? 0) >= action.payload.txBlock || !action.payload.confirmed)
    return state;
  const channel: Channel = {
    state: ChannelState.open,
    id: action.payload.id,
    token: action.payload.token,
    tokenNetwork: action.meta.tokenNetwork,
    settleTimeout: action.payload.settleTimeout,
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

  const prop = channelWithdrawn.is(action) ? 'withdraw' : 'deposit';
  const total = channelWithdrawn.is(action)
    ? action.payload.totalWithdraw
    : action.payload.totalDeposit;

  const isPartner = action.payload.participant === action.meta.partner;
  const channelSide = isPartner ? 'partner' : 'own';

  channel = {
    ...channel,
    [channelSide]: {
      ...channel[channelSide],
      [prop]: total,
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
  else if (action.payload.confirmed)
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
  action: channelClose.request | channelSettle.request | channelSettleable,
): RaidenState {
  const key = channelKey(action.meta);
  let channel = state.channels[key];
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
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function channelSettleSuccessReducer(
  state: RaidenState,
  action: channelSettle.success,
): RaidenState {
  const key = channelKey(action.meta);
  const channel = state.channels[key];
  if (channel?.id !== action.payload.id || !('closeBlock' in channel)) return state;
  if (action.payload.confirmed === undefined && channel.state !== ChannelState.settling)
    // on non-confirmed action, set channel as settling
    return {
      ...state,
      channels: { ...state.channels, [key]: { ...channel, state: ChannelState.settling } },
    };
  else if (action.payload.confirmed) {
    const { [key]: _, ...channels } = state.channels; // pop [key] channel out of state.channels
    return {
      ...state,
      channels, // replace channels without [key]
      oldChannels: {
        // persist popped channel on oldChannels with augmented channelKey
        ...state.oldChannels,
        [`${channel.id}#${key}`]: {
          ...channel,
          state: ChannelState.settled,
          settleBlock: action.payload.txBlock,
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
    [channelClose.request, channelSettleable, channelSettle.request],
    channelUpdateStateReducer,
  )
  .handle(channelClose.success, channelCloseSuccessReducer)
  .handle(channelSettle.success, channelSettleSuccessReducer);

/**
 * Nested/combined reducer for channels
 * blockNumber, tokens & pendingTxs reducers get its own slice of the state, corresponding to the
 * name of the reducer. channels root reducer instead must be handled the complete state instead,
 * so it compose the output with each key/nested/combined state.
 */
const partialReducer = partialCombineReducers({ blockNumber, tokens, pendingTxs }, initialState);
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
