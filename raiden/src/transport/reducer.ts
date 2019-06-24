import { getType } from 'typesafe-actions';
import { get, getOr, isEmpty, set, unset } from 'lodash/fp';

import { partialCombineReducers } from '../utils/redux';
import { RaidenAction } from '../actions';
import { RaidenState, initialState } from '../store/state';
import { matrixSetup, matrixRoom, matrixRoomLeave } from './actions';

/**
 * state.transport reducer
 * Handles all transport actions and requests
 */
const transport = (
  state: Readonly<RaidenState['transport']> = initialState.transport,
  action: RaidenAction,
) => {
  switch (action.type) {
    case getType(matrixSetup):
      return {
        ...state,
        matrix: {
          ...state.matrix,
          ...action.payload,
        },
      };

    case getType(matrixRoom): {
      const path = ['matrix', 'rooms', action.meta.address];
      return set(
        path,
        [
          action.payload.roomId,
          ...(getOr([], path, state) as string[]).filter(room => room !== action.payload.roomId),
        ],
        state,
      );
    }

    case getType(matrixRoomLeave): {
      const path = ['matrix', 'rooms', action.meta.address];
      state = set(
        path,
        (getOr([], path, state) as string[]).filter(r => r !== action.payload.roomId),
        state,
      );
      if (isEmpty(get(path, state))) state = unset(path, state);
      return state;
    }

    default:
      return state;
  }
};

/**
 * Nested/combined reducer for transport
 * Currently only handles 'transport' substate
 */
export const transportReducer = partialCombineReducers({ transport }, initialState);
