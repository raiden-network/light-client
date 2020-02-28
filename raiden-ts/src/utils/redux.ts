import { Action, Reducer } from './actions';

/**
 * Like redux's combineReducers, but allows passing only a partial reducer mapping
 * redux's combineReducers output state must be exactly the mapping passed as parameter,
 * which doesn't allow to only provide a partial set of reducers and passthrough the other state's
 * keys. This function allows that, also preserving state/object reference when reducers don't
 * change state value.
 *
 * @param reducers - A mapping of a subset of state's key to nested reducers functions
 * @param initialState - global initial state, required when initializing first object with partial
 *                      reducers
 * @returns Full reducer for state S and actions A
 */
export function partialCombineReducers<S, A extends Action = Action>(
  reducers: { [K in keyof S]?: Reducer<S[K], A> },
  initialState: S,
): Reducer<S, A> {
  return function(state: S = initialState, action: A): S {
    for (const key in reducers) {
      const reducer = reducers[key];
      if (!reducer) continue; // shouldn't happen, only here for type safety below
      const subState = state[key] ?? initialState[key];
      const newSubState = reducer(subState, action);
      if (newSubState !== subState) {
        state = { ...state, [key]: newSubState };
      }
    }
    return state;
  };
}
