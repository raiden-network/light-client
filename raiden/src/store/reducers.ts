import { cloneDeep, get, set, unset } from 'lodash';
import {
  RaidenState,
  initialState,
  ChannelState,
  Channel,
} from './state';
import {
  RaidenActions,
  RaidenActionType,
} from './actions';


export function raidenReducer(
  state: RaidenState = initialState,
  action: RaidenActions,
): RaidenState {
  let channel: Channel;
  let path: string[];
  switch (action.type) {
    case RaidenActionType.NEW_BLOCK:
      return { ...state, blockNumber: action.blockNumber };

    case RaidenActionType.CHANNEL_OPEN:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      if (get(state, path))  // there's already a channel with partner
        return state;
      return set(
        cloneDeep(state),
        path,
        { state: ChannelState.opening, deposit: action.deposit },
      );

    case RaidenActionType.CHANNEL_OPENED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      channel = {
        deposit: 0,
        ...get(state, path), // if not found, undefined is noop
        state: ChannelState.open,
        id: action.id,
        settleTimeout: action.settleTimeout,
        openBlock: action.openBlock,
        /* txHash: action.txHash, */  // not needed in state for now, but comes in action
      };
      return set(cloneDeep(state), path, channel);

    case RaidenActionType.CHANNEL_OPEN_FAILED:
      path = ['tokenNetworks', action.tokenNetwork, action.partner];
      if (get(state, [...path, 'state']) !== ChannelState.opening)
        return state;
      const newState = cloneDeep(state);
      unset(newState, path);
      return newState;

    case RaidenActionType.TOKEN_MONITORED:
      // action.first should be true, but not required,
      // actual check is if token is in state.token2tokenNetwork
      if (action.token in state.token2tokenNetwork)
        return state;
      return set(
        cloneDeep(state),
        ['token2tokenNetwork', action.token],
        action.tokenNetwork,
      );

    default:
      return state;
  }
}
