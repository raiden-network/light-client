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
  .handle(matrixRoom, (state, action) => ({
    ...state,
    matrix: {
      ...state.matrix!,
      rooms: {
        ...state.matrix?.rooms,
        [action.meta.address]: [
          action.payload.roomId,
          ...(state.matrix?.rooms?.[action.meta.address] ?? []).filter(
            (room) => room !== action.payload.roomId,
          ),
        ],
      },
    },
  }))
  .handle(matrixRoomLeave, (state, action) => ({
    ...state,
    matrix: {
      ...state.matrix!,
      rooms: {
        ...state.matrix?.rooms,
        [action.meta.address]: (state.matrix?.rooms?.[action.meta.address] ?? []).filter(
          (room) => room !== action.payload.roomId,
        ),
      },
    },
  }));

/**
 * Nested/combined reducer for transport
 * Currently only handles 'transport' substate
 */
const transportReducer = partialCombineReducers({ transport }, initialState);
export default transportReducer;
