/**
 * state.path reducer
 * Handles all path actions and requests
 *
 * @param state - Current RaidenState['path'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['path'] slice
 */
import unset from 'lodash/fp/unset';

import { initialState } from '../state';
import { partialCombineReducers } from '../utils/redux';
import { createReducer } from '../utils/actions';
import { iouClear, iouPersist } from './actions';

const path = createReducer(initialState.path)
  .handle(iouPersist, (state, action) => ({
    ...state,
    iou: {
      ...state.iou,
      [action.meta.tokenNetwork]: {
        ...state.iou[action.meta.tokenNetwork],
        [action.meta.serviceAddress]: action.payload.iou,
      },
    },
  }))
  .handle(iouClear, (state, action) => {
    const path = ['iou', action.meta.tokenNetwork, action.meta.serviceAddress];
    return unset(path, state);
  });

/**
 * Nested combined reducer for path
 * Handles the 'path' substate.
 */
const servicesReducer = partialCombineReducers({ path }, initialState);
export default servicesReducer;
