import { getType } from 'typesafe-actions';
import { get, set, unset } from 'lodash/fp';
import { Zero } from 'ethers/constants';

import { Address } from '../utils/types';
import { partialCombineReducers } from '../utils/redux';
import { RaidenAction } from '../actions';
import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelOpened,
  channelOpenFailed,
  channelDeposited,
  channelClose,
  channelClosed,
  channelSettleable,
  channelSettle,
  channelSettled,
} from './actions';
import { Channel, Channels } from './state';
import { ChannelState } from './types';
import { initialState } from '../store/state';

// state.blockNumber specific reducer, handles only newBlock action
const blockNumber = (state: number = initialState.blockNumber, action: RaidenAction) => {
  switch (action.type) {
    case getType(newBlock):
      return action.payload.blockNumber;
    default:
      return state;
  }
};

// state.tokens specific reducer, handles only tokenMonitored action
const tokens = (
  state: Readonly<{ [token: string]: Address }> = initialState.tokens,
  action: RaidenAction,
) => {
  switch (action.type) {
    case getType(tokenMonitored):
      return set([action.payload.token], action.payload.tokenNetwork, state);
    default:
      return state;
  }
};

// handles all channel actions and requests
const channels = (state: Readonly<Channels> = initialState.channels, action: RaidenAction) => {
  switch (action.type) {
    case getType(channelOpen): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      if (get(path, state)) return state; // there's already a channel with partner
      const channel: Channel = {
        state: ChannelState.opening,
        own: { deposit: Zero },
        partner: { deposit: Zero },
      };
      return set(path, channel, state);
    }

    case getType(channelOpened): {
      const path = [action.meta.tokenNetwork, action.meta.partner],
        channel: Channel = {
          state: ChannelState.open,
          own: { deposit: Zero },
          partner: { deposit: Zero },
          id: action.payload.id,
          settleTimeout: action.payload.settleTimeout,
          openBlock: action.payload.openBlock,
          /* txHash: action.txHash, */ // not needed in state for now, but comes in action
        };
      return set(path, channel, state);
    }

    case getType(channelOpenFailed): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      if (get([...path, 'state'], state) !== ChannelState.opening) return state;
      return unset(path, state);
    }

    case getType(channelDeposited): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      let channel: Channel | undefined = get(path, state);
      if (!channel || channel.state !== ChannelState.open || channel.id !== action.payload.id)
        return state;
      if (action.payload.participant === action.meta.partner)
        channel = set(['partner', 'deposit'], action.payload.totalDeposit, channel);
      else channel = set(['own', 'deposit'], action.payload.totalDeposit, channel);
      return set(path, channel, state);
    }

    case getType(channelClose): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      let channel: Channel | undefined = get(path, state);
      if (!channel || channel.state !== ChannelState.open) return state;
      channel = { ...channel, state: ChannelState.closing };
      return set(path, channel, state);
    }

    case getType(channelClosed): {
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
    }

    case getType(channelSettleable): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      let channel: Channel | undefined = get(path, state);
      if (!channel || channel.state !== ChannelState.closed) return state;
      channel = { ...channel, state: ChannelState.settleable };
      return set(path, channel, state);
    }

    case getType(channelSettle): {
      const path = [action.meta.tokenNetwork, action.meta.partner];
      let channel: Channel | undefined = get(path, state);
      if (!channel || channel.state !== ChannelState.settleable) return state;
      channel = { ...channel, state: ChannelState.settling };
      return set(path, channel, state);
    }

    case getType(channelSettled): {
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
    }

    default:
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
  { blockNumber, tokens, channels },
  initialState,
);
