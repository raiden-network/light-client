import { cloneDeep, get, isEmpty, set, unset } from 'lodash';
import { Zero } from 'ethers/constants';

import { RaidenState, initialState, ChannelState, Channel } from './state';
import { RaidenActions, RaidenActionType } from './actions';

export function raidenReducer(
  state: RaidenState = initialState,
  action: RaidenActions,
): RaidenState {
  let channel: Channel;
  let path: string[];
  switch (action.type) {
    case RaidenActionType.NEW_BLOCK:
      return { ...state, blockNumber: action.blockNumber };

    case RaidenActionType.TOKEN_MONITORED:
      // action.first should be true, but not required,
      // actual check is if token is in state.token2tokenNetwork
      if (action.token in state.token2tokenNetwork) return state;
      return set(cloneDeep(state), ['token2tokenNetwork', action.token], action.tokenNetwork);

    case RaidenActionType.CHANNEL_OPEN:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      if (get(state, path)) return state; // there's already a channel with partner
      return set(cloneDeep(state), path, {
        state: ChannelState.opening,
        totalDeposit: Zero,
        partnerDeposit: Zero,
      });

    case RaidenActionType.CHANNEL_OPENED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      channel = {
        totalDeposit: Zero,
        partnerDeposit: Zero,
        state: ChannelState.open,
        id: action.id,
        settleTimeout: action.settleTimeout,
        openBlock: action.openBlock,
        /* txHash: action.txHash, */ // not needed in state for now, but comes in action
      };
      return set(cloneDeep(state), path, channel);

    case RaidenActionType.CHANNEL_OPEN_FAILED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      if (get(state, [...path, 'state']) !== ChannelState.opening) return state;
      const newState = cloneDeep(state);
      unset(newState, path);
      return newState;

    case RaidenActionType.CHANNEL_DEPOSITED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      channel = cloneDeep(get(state, path));
      if (!channel || channel.state !== ChannelState.open || channel.id !== action.id)
        return state;
      if (action.participant === state.address) channel.totalDeposit = action.totalDeposit;
      else if (action.participant === action.partner) channel.partnerDeposit = action.totalDeposit;
      else return state; // shouldn't happen, deposit from neither us or partner
      return set(cloneDeep(state), path, channel);

    case RaidenActionType.CHANNEL_CLOSE:
      path = ['tokenNetworks', action.tokenNetwork, action.partner, 'state'];
      if (get(state, path) !== ChannelState.open) return state;
      return set(cloneDeep(state), path, ChannelState.closing);

    case RaidenActionType.CHANNEL_CLOSED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      channel = cloneDeep(get(state, path));
      if (
        !channel ||
        !(channel.state === ChannelState.open || channel.state === ChannelState.closing) ||
        channel.id !== action.id
      )
        return state;
      channel.state = ChannelState.closed;
      channel.closeBlock = action.closeBlock;
      return set(cloneDeep(state), path, channel);

    case RaidenActionType.CHANNEL_SETTLEABLE:
      path = ['tokenNetworks', action.tokenNetwork, action.partner, 'state'];
      if (get(state, path) !== ChannelState.closed) return state;
      return set(cloneDeep(state), path, ChannelState.settleable);

    case RaidenActionType.CHANNEL_SETTLE:
      path = ['tokenNetworks', action.tokenNetwork, action.partner, 'state'];
      if (get(state, path) !== ChannelState.settleable) return state;
      return set(cloneDeep(state), path, ChannelState.settling);

    case RaidenActionType.CHANNEL_SETTLED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner, 'state'];
      if (
        ![ChannelState.closed, ChannelState.settleable, ChannelState.settling].includes(
          get(state, path),
        )
      )
        return state;
      state = cloneDeep(state);
      delete state.tokenNetworks[action.tokenNetwork][action.partner];
      return state;

    case RaidenActionType.MATRIX_SETUP:
      state = cloneDeep(state);
      set(state, ['transport', 'matrix', 'server'], action.server);
      set(state, ['transport', 'matrix', 'setup'], action.setup);
      return state;

    case RaidenActionType.MATRIX_ROOM:
      path = ['transport', 'matrix', 'address2rooms', action.address];
      return set(cloneDeep(state), path, [
        action.roomId,
        ...(get(state, path, []) as string[]).filter(room => room !== action.roomId),
      ]);

    case RaidenActionType.MATRIX_ROOM_LEAVE:
      path = ['transport', 'matrix', 'address2rooms', action.address];
      state = cloneDeep(state);
      set(state, path, (get(state, path, []) as string[]).filter(r => r !== action.roomId));
      if (isEmpty(get(state, path, []))) {
        unset(state, path);
      }
      return state;

    default:
      return state;
  }
}
