/**
 * state.iou reducer
 * Handles all iou actions and requests
 *
 * @param state - Current RaidenState['iou'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['iou'] slice
 */
import unset from 'lodash/fp/unset';

import { initialState } from '../state';
import { partialCombineReducers } from '../utils/redux';
import { createReducer } from '../utils/actions';
import { iouClear, iouPersist } from './actions';

const iou = createReducer(initialState.iou)
  .handle(iouPersist, (state, action) => ({
    ...state,
    [action.meta.tokenNetwork]: {
      ...state[action.meta.tokenNetwork],
      [action.meta.serviceAddress]: action.payload.iou,
    },
  }))
  .handle(iouClear, (state, action) =>
    unset([action.meta.tokenNetwork, action.meta.serviceAddress], state),
  );

/**
 * Nested combined reducer for iou
 * Handles the 'iou' substate.
 */
const servicesReducer = partialCombineReducers({ iou }, initialState);
export default servicesReducer;
