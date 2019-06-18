import { getType } from 'typesafe-actions';
import { cloneDeep, get, isEmpty, set, unset } from 'lodash';
import { Zero } from 'ethers/constants';

import { RaidenAction } from './';
import { RaidenState, initialState, ChannelState, Channel } from './state';
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
  matrixSetup,
  matrixRoom,
  matrixRoomLeave,
} from './actions';

export function raidenReducer(
  state: RaidenState = initialState,
  action: RaidenAction,
): RaidenState {
  let channel: Channel;
  let path: string[];
  switch (action.type) {
    case getType(newBlock):
      return { ...state, blockNumber: action.payload.blockNumber };

    case getType(tokenMonitored):
      // action.first should be true, but not required,
      // actual check is if token is in state.token2tokenNetwork
      if (action.payload.token in state.token2tokenNetwork) return state;
      return set(
        cloneDeep(state),
        ['token2tokenNetwork', action.payload.token],
        action.payload.tokenNetwork,
      );

    case getType(channelOpen):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner];
      if (get(state, path)) return state; // there's already a channel with partner
      return set(cloneDeep(state), path, {
        state: ChannelState.opening,
        totalDeposit: Zero,
        partnerDeposit: Zero,
      });

    case getType(channelOpened):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner];
      channel = {
        totalDeposit: Zero,
        partnerDeposit: Zero,
        state: ChannelState.open,
        id: action.payload.id,
        settleTimeout: action.payload.settleTimeout,
        openBlock: action.payload.openBlock,
        /* txHash: action.txHash, */ // not needed in state for now, but comes in action
      };
      return set(cloneDeep(state), path, channel);

    case getType(channelOpenFailed):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner];
      if (get(state, [...path, 'state']) !== ChannelState.opening) return state;
      const newState = cloneDeep(state);
      unset(newState, path);
      return newState;

    case getType(channelDeposited):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner];
      channel = cloneDeep(get(state, path));
      if (!channel || channel.state !== ChannelState.open || channel.id !== action.payload.id)
        return state;
      if (action.payload.participant === state.address)
        channel.totalDeposit = action.payload.totalDeposit;
      else if (action.payload.participant === action.meta.partner)
        channel.partnerDeposit = action.payload.totalDeposit;
      else return state; // shouldn't happen, deposit from neither us or partner
      return set(cloneDeep(state), path, channel);

    case getType(channelClose):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner, 'state'];
      if (get(state, path) !== ChannelState.open) return state;
      return set(cloneDeep(state), path, ChannelState.closing);

    case getType(channelClosed):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner];
      channel = cloneDeep(get(state, path));
      if (
        !channel ||
        !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
        channel.id !== action.payload.id
      )
        return state;
      channel.state = ChannelState.closed;
      channel.closeBlock = action.payload.closeBlock;
      return set(cloneDeep(state), path, channel);

    case getType(channelSettleable):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner, 'state'];
      if (get(state, path) !== ChannelState.closed) return state;
      return set(cloneDeep(state), path, ChannelState.settleable);

    case getType(channelSettle):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner, 'state'];
      if (get(state, path) !== ChannelState.settleable) return state;
      return set(cloneDeep(state), path, ChannelState.settling);

    case getType(channelSettled):
      path = ['tokenNetworks', action.meta.tokenNetwork, action.meta.partner, 'state'];
      if (
        ![ChannelState.closed, ChannelState.settleable, ChannelState.settling].includes(
          get(state, path),
        )
      )
        return state;
      state = cloneDeep(state);
      delete state.tokenNetworks[action.meta.tokenNetwork][action.meta.partner];
      return state;

    case getType(matrixSetup):
      state = cloneDeep(state);
      set(state, ['transport', 'matrix', 'server'], action.payload.server);
      set(state, ['transport', 'matrix', 'setup'], action.payload.setup);
      return state;

    case getType(matrixRoom):
      path = ['transport', 'matrix', 'address2rooms', action.meta.address];
      return set(cloneDeep(state), path, [
        action.payload.roomId,
        ...(get(state, path, []) as string[]).filter(room => room !== action.payload.roomId),
      ]);

    case getType(matrixRoomLeave):
      path = ['transport', 'matrix', 'address2rooms', action.meta.address];
      state = set(
        cloneDeep(state),
        path,
        (get(state, path, []) as string[]).filter(r => r !== action.payload.roomId),
      );
      if (isEmpty(get(state, path, []))) {
        unset(state, path);
      }
      return state;

    default:
      return state;
  }
}
