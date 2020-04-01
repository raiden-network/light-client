/**
 * state.path reducer
 * Handles all path actions and requests
 *
 * @param state - Current RaidenState['path'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['path'] slice
 */
import set from 'lodash/fp/set';
import unset from 'lodash/fp/unset';

import { initialState } from '../state';
import { partialCombineReducers } from '../utils/redux';
import { createReducer } from '../utils/actions';
import { iouClear, iouPersist } from './actions';

const path = createReducer(initialState.path)
  .handle(iouPersist, (state, action) => {
    const path = ['iou', action.meta.tokenNetwork, action.meta.serviceAddress];
    return set(path, action.payload.iou, state);
  })
  .handle(iouClear, (state, action) => {
    const path = ['iou', action.meta.tokenNetwork, action.meta.serviceAddress];
    return unset(path, state);
  });

/**
 * Nested combined reducer for path
 * Handles the 'path' substate.
 */
export const pathReducer = partialCombineReducers({ path }, initialState);
