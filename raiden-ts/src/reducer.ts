import unset from 'lodash/fp/unset';

import { channelsReducer } from './channels/reducer';
import { pathReducer } from './path/reducer';
import { transportReducer } from './transport/reducer';
import { transfersReducer } from './transfers/reducer';

import { PartialRaidenConfig } from './config';
import { RaidenAction, raidenConfigUpdate } from './actions';
import { RaidenState, initialState } from './state';
import { createReducer } from './utils/actions';

// update state.config on raidenConfigUpdate action
// resets key to default value if value is undefined, otherwise overwrites it
const configReducer = createReducer(initialState).handle(
  raidenConfigUpdate,
  (state, { payload }) => {
    let config: PartialRaidenConfig = state.config;
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) config = { ...config, [k]: v };
      else if (k in config) config = unset(k, config);
    }
    if (config === state.config) return state;
    return { ...state, config };
  },
);

const raidenReducers = {
  configReducer,
  channelsReducer,
  pathReducer,
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
 *
 * @param state - Current RaidenState to reduce
 * @param action - RaidenAction to apply over state
 * @returns New RaidenState
 */
export const raidenReducer = (state: RaidenState = initialState, action: RaidenAction) =>
  Object.values(raidenReducers).reduce((s, reducer) => reducer(s, action), state);
