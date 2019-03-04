import { RaidenState, initialState } from './state';
import {
  RaidenActionTypes,
  NEW_BLOCK,
} from './actions';


export function raidenReducer(
  state: RaidenState = initialState,
  action: RaidenActionTypes,
): RaidenState {
  switch (action.type) {
    case NEW_BLOCK:
      return { ...state, blockNumber: action.payload };
    default:
      return state;
  }
}
