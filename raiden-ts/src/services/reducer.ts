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
import { createReducer } from '../utils/actions';
import { partialCombineReducers } from '../utils/redux';
import { iouClear, iouPersist, servicesValid } from './actions';

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

const services = createReducer(initialState.services).handle(
  servicesValid,
  (_s, action) => action.payload,
);

/**
 * Nested combined reducer for iou
 * Handles the 'iou' substate.
 */
const servicesReducer = partialCombineReducers({ iou, services }, initialState);
export default servicesReducer;
