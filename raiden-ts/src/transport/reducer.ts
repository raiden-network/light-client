import { get, getOr, isEmpty, set, unset } from 'lodash/fp';

import { partialCombineReducers } from '../utils/redux';
import { isActionOf } from '../utils/actions';
import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { matrixSetup, matrixRoom, matrixRoomLeave } from './actions';

/**
 * state.transport reducer
 * Handles all transport actions and requests
 *
 * @param state - Current RaidenState['transport'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['transport'] slice
 */
function transport(
  state: RaidenState['transport'] = initialState.transport,
  action: RaidenAction,
) {
  if (isActionOf(matrixSetup, action)) {
    return {
      ...state,
      matrix: {
        ...state.matrix,
        ...action.payload,
      },
    };
  } else if (isActionOf(matrixRoom, action)) {
    const path = ['matrix', 'rooms', action.meta.address];
    return set(
      path,
      [
        action.payload.roomId,
        ...(getOr([], path, state) as string[]).filter(room => room !== action.payload.roomId),
      ],
      state,
    );
  } else if (isActionOf(matrixRoomLeave, action)) {
    const path = ['matrix', 'rooms', action.meta.address];
    state = set(
      path,
      (getOr([], path, state) as string[]).filter(r => r !== action.payload.roomId),
      state,
    );
    if (isEmpty(get(path, state))) state = unset(path, state);
    return state;
  } else return state;
}

/**
 * Nested/combined reducer for transport
 * Currently only handles 'transport' substate
 */
export const transportReducer = partialCombineReducers({ transport }, initialState);
