import isEqual from 'lodash/isEqual';

import { initialState } from '../state';
import { createReducer } from '../utils/actions';
import { partialCombineReducers } from '../utils/redux';
import { matrixSetup } from './actions';

/**
 * state.transport reducer
 * Handles all transport actions and requests
 *
 * @param state - Current RaidenState['transport'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['transport'] slice
 */

const transport = createReducer(initialState.transport).handle(matrixSetup, (state, action) => {
  // immutably remove rooms from state.transport
  if (!isEqual(state, action.payload)) state = action.payload;
  return state;
});

/**
 * Nested/combined reducer for transport
 * Currently only handles 'transport' substate
 */
const transportReducer = partialCombineReducers({ transport }, initialState);
export default transportReducer;
