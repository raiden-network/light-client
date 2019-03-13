import { cloneDeep, get, set, unset } from 'lodash';
import { bigNumberify } from './types';
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
        totalDeposit: 0,
        partnerDeposit: 0,
      });

    case RaidenActionType.CHANNEL_OPENED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      channel = {
        totalDeposit: bigNumberify(0),
        partnerDeposit: bigNumberify(0),
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

    default:
      return state;
  }
}
