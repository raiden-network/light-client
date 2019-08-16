import { isActionOf } from 'typesafe-actions';
import { get, set, unset } from 'lodash/fp';
import { Zero } from 'ethers/constants';

import { UInt } from '../utils/types';
import { partialCombineReducers } from '../utils/redux';
import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import {
  channelClose,
  channelClosed,
  channelDeposited,
  channelOpen,
  channelOpened,
  channelOpenFailed,
  channelSettle,
  channelSettleable,
  channelSettled,
  newBlock,
  tokenMonitored,
} from './actions';
import { Channel, Channels, ChannelState } from './state';

// state.blockNumber specific reducer, handles only newBlock action
function blockNumber(state: number = initialState.blockNumber, action: RaidenAction) {
  if (isActionOf(newBlock, action)) return action.payload.blockNumber;
  else return state;
}

// state.tokens specific reducer, handles only tokenMonitored action
function tokens(state: RaidenState['tokens'] = initialState.tokens, action: RaidenAction) {
  if (isActionOf(tokenMonitored, action))
    return set([action.payload.token], action.payload.tokenNetwork, state);
  else return state;
}

// handles all channel actions and requests
function channels(state: Channels = initialState.channels, action: RaidenAction) {
  if (isActionOf(channelOpen, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    if (get(path, state)) return state; // there's already a channel with partner
    const channel: Channel = {
      state: ChannelState.opening,
      own: { deposit: Zero as UInt<32> },
      partner: { deposit: Zero as UInt<32> },
    };
    return set(path, channel, state);
  } else if (isActionOf(channelOpened, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner],
      channel: Channel = {
        state: ChannelState.open,
        own: { deposit: Zero as UInt<32> },
        partner: { deposit: Zero as UInt<32> },
        id: action.payload.id,
        settleTimeout: action.payload.settleTimeout,
        openBlock: action.payload.openBlock,
        /* txHash: action.txHash, */ // not needed in state for now, but comes in action
      };
    return set(path, channel, state);
  } else if (isActionOf(channelOpenFailed, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    if (get([...path, 'state'], state) !== ChannelState.opening) return state;
    return unset(path, state);
  } else if (isActionOf(channelDeposited, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (!channel || channel.state !== ChannelState.open || channel.id !== action.payload.id)
      return state;
    if (action.payload.participant === action.meta.partner)
      channel = set(['partner', 'deposit'], action.payload.totalDeposit, channel);
    else channel = set(['own', 'deposit'], action.payload.totalDeposit, channel);
    return set(path, channel, state);
  } else if (isActionOf(channelClose, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (!channel || channel.state !== ChannelState.open) return state;
    channel = { ...channel, state: ChannelState.closing };
    return set(path, channel, state);
  } else if (isActionOf(channelClosed, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (
      !channel ||
      !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
      channel.id !== action.payload.id
    )
      return state;
    channel = { ...channel, state: ChannelState.closed, closeBlock: action.payload.closeBlock };
    return set(path, channel, state);
  } else if (isActionOf(channelSettleable, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (!channel || channel.state !== ChannelState.closed) return state;
    channel = { ...channel, state: ChannelState.settleable };
    return set(path, channel, state);
  } else if (isActionOf(channelSettle, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (!channel || channel.state !== ChannelState.settleable) return state;
    channel = { ...channel, state: ChannelState.settling };
    return set(path, channel, state);
  } else if (isActionOf(channelSettled, action)) {
    const path = [action.meta.tokenNetwork, action.meta.partner];
    let channel: Channel | undefined = get(path, state);
    if (
      !channel ||
      ![ChannelState.closed, ChannelState.settleable, ChannelState.settling].includes(
        channel.state,
      )
    )
      return state;
    return unset(path, state);
  } else return state;
}

/**
 * Nested/combined reducer for channels
 * blockNumber, tokens & channels reducers get its own slice of the state, corresponding to the
 * name of the reducer. channels root reducer instead must be handled the complete state instead,
 * so it compose the output with each key/nested/combined state.
 */
export const channelsReducer = partialCombineReducers(
  { blockNumber, tokens, channels },
  initialState,
);
