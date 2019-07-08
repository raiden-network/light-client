import { channelsReducer } from './channels/reducer';
import { transportReducer } from './transport/reducer';
import { transfersReducer } from './transfers/reducer';

import { RaidenAction } from './actions';
import { RaidenState, initialState } from './store/state';

const raidenReducers = {
  channelsReducer,
  transportReducer,
  transfersReducer,
};

/**
 * Raiden root reducer
 * Apply action over each submodule root reducer in a flattened manner (iteratively).
 * Notice the submodules reducers aren't handled only a partial/deep property of the state
 * (as combineReducers), but instead receive the whole state, so they can act on any part of the
 * state. This approach is similar to `reduce-reducers` util.
 * Each submodule root reducer may then choose to split its concerns into nested or flattened
 * reducers (like this one).
 */
export const raidenReducer = (state: Readonly<RaidenState> = initialState, action: RaidenAction) =>
  Object.values(raidenReducers).reduce((s, reducer) => reducer(s, action), state);
