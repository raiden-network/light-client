import get from 'lodash/fp/get';
import getOr from 'lodash/fp/getOr';
import isEmpty from 'lodash/fp/isEmpty';
import set from 'lodash/fp/set';
import unset from 'lodash/fp/unset';

import { partialCombineReducers } from '../utils/redux';
import { createReducer } from '../utils/actions';
import { initialState } from '../state';
import { matrixSetup, matrixRoom, matrixRoomLeave } from './actions';

/**
 * state.transport reducer
 * Handles all transport actions and requests
 *
 * @param state - Current RaidenState['transport'] slice
 * @param action - RaidenAction to handle
 * @returns New RaidenState['transport'] slice
 */

const transport = createReducer(initialState.transport)
  .handle(matrixSetup, (state, action) => {
    // immutably remove rooms from state.matrix
    const { rooms: _, ...noRooms } = { ...state.matrix };
    return {
      ...state,
      matrix: {
        // invalidate rooms map if server has changed
        ...(state.matrix?.server !== action.payload.server ? noRooms : state.matrix),
        ...action.payload,
      },
    };
  })
  .handle(matrixRoom, (state, action) => {
    const path = ['matrix', 'rooms', action.meta.address];
    return set(
      path,
      [
        action.payload.roomId,
        ...(getOr([], path, state) as string[]).filter(room => room !== action.payload.roomId),
      ],
      state,
    );
  })
  .handle(matrixRoomLeave, (state, action) => {
    const path = ['matrix', 'rooms', action.meta.address];
    state = set(
      path,
      (getOr([], path, state) as string[]).filter(r => r !== action.payload.roomId),
      state,
    );
    if (isEmpty(get(path, state))) state = unset(path, state);
    return state;
  });

/**
 * Nested/combined reducer for transport
 * Currently only handles 'transport' substate
 */
export const transportReducer = partialCombineReducers({ transport }, initialState);
