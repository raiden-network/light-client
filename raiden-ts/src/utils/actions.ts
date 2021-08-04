/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import isMatchWith from 'lodash/isMatchWith';
import type { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { assert } from '../utils';
import { ErrorCodes, RaidenError } from '../utils/error';
import type { Hash } from './types';
import { BigNumberC } from './types';

/**
 * The type of a generic action
 */
export type Action<TType extends string = string> = { readonly type: TType };
export type Reducer<S = any, A extends Action = Action> = (state: S | undefined, action: A) => S;

interface ActionConstraint {
  readonly type: string;
  readonly payload?: unknown;
  readonly meta?: unknown;
  readonly error?: true;
}
type ActionFactory<A extends ActionConstraint> = A extends { readonly meta?: unknown }
  ? A extends { readonly payload?: unknown }
    ? (payload: A['payload'], meta: A['meta']) => A
    : (_: undefined, meta: A['meta']) => A
  : A extends { readonly payload?: unknown }
  ? (payload: A['payload']) => A
  : () => A;
type ActionCreatorMembers<A extends ActionConstraint> = {
  type: A['type'];
  codec: t.Mixed;
  is: (a: unknown) => a is A;
  error: A extends { readonly error: true } ? true : undefined;
};
export type ActionCreator<A extends ActionConstraint> = ActionFactory<A> & ActionCreatorMembers<A>;

type ActionCreatorFromTuple<
  P extends readonly [type: string, payload?: t.Mixed, meta?: t.Mixed, error?: true],
> = ActionCreator<
  P extends { readonly 3: true }
    ? P extends { readonly 2: t.Mixed }
      ? P extends { readonly 1: t.Mixed }
        ? {
            readonly type: P[0];
            readonly payload: t.TypeOf<P[1]>;
            readonly meta: t.TypeOf<P[2]>;
            readonly error: true;
          }
        : { readonly type: P[0]; readonly meta: t.TypeOf<P[2]>; readonly error: true }
      : P extends { readonly 1: t.Mixed }
      ? { readonly type: P[0]; readonly payload: t.TypeOf<P[1]>; readonly error: true }
      : { readonly type: P[0]; readonly error: true }
    : P extends { readonly 2: t.Mixed }
    ? P extends { readonly 1: t.Mixed }
      ? { readonly type: P[0]; readonly payload: t.TypeOf<P[1]>; readonly meta: t.TypeOf<P[2]> }
      : { readonly type: P[0]; readonly meta: t.TypeOf<P[2]> }
    : P extends { readonly 1: t.Mixed }
    ? { readonly type: P[0]; readonly payload: t.TypeOf<P[1]> }
    : { readonly type: P[0] }
>;
/**
 * @param args - Args params
 * @returns action creator
 */
export function createAction<
  P extends readonly [type: string, payload?: t.Mixed, meta?: t.Mixed, error?: true],
>(...args: P): ActionCreatorFromTuple<P> {
  const [type, payloadCodec, metaCodec, error] = args;
  const codec = t.readonly(
    t.type({
      type: t.literal(type),
      ...(payloadCodec ? { payload: payloadCodec } : null),
      ...(metaCodec ? { meta: metaCodec } : null),
      ...(error ? { error: t.literal(true) } : null),
    }),
  );
  type A = t.TypeOf<typeof codec>;

  const is =
    process.env.NODE_ENV === 'development'
      ? (action: unknown): action is A => codec.is(action)
      : (action: unknown): action is A =>
          (action as { type: string } | undefined)?.['type'] === type;

  return Object.assign(
    function actionFactory(payload: A['payload'], meta: A['meta']) {
      return {
        type,
        ...(payloadCodec ? { payload } : {}),
        ...(metaCodec ? { meta } : {}),
        ...(error ? { error } : {}),
      };
    },
    { type, is, codec, error },
  ) as unknown as ActionCreatorFromTuple<P>;
}

export type AnyAC = ActionCreator<any>;

/**
 * A version of ReturnType which returns `never` insted of `any` if it can't match function type
 */
export type OnlyReturnType<F> = F extends (...args: any) => infer R ? R : never;
/** union of all value types in type T */
export type ValueOf<T> = T[keyof T];

/** Types extending this constraint can be unfolded/flattened into a union of ActionCreators */
export type ActionsUnionConstraint =
  | readonly AnyAC[]
  | { readonly [K: string]: AnyAC | { readonly [K2: string]: AnyAC } }
  | AnyAC;
/** Convert tuples, arrays, modules and mappings containing ACs & AACs to the plain union of ACs */
export type ActionsUnion<AC extends ActionsUnionConstraint> = AC extends readonly AnyAC[]
  ? AC[number]
  : AC extends AnyAC
  ? AC
  : ValueOf<
      {
        [K in keyof AC]: AC[K] extends AnyAC
          ? AC[K]
          : AC[K] extends { readonly [K2: string]: AnyAC }
          ? ValueOf<AC[K]>
          : never;
      }
    >;

/**
 * Type helper to extract the type of an action or a mapping of actions
 * Usage: const action: ActionType<typeof actionCreator>;
 */
export type ActionType<AC extends ActionsUnionConstraint> = OnlyReturnType<ActionsUnion<AC>>;
export type ActionTypeOf<AC extends ActionsUnionConstraint> = ActionType<AC>['type'];

// isActionOf curry overloads
export function isActionOf<AC extends ActionsUnionConstraint>(
  ac: AC,
  action: unknown,
): action is ActionType<AC>;
export function isActionOf<AC extends ActionsUnionConstraint>(
  ac: AC,
): (action: unknown) => action is ActionType<AC>;

/**
 * Curried typeguard function (arity=2) which validates 2nd param is of type of some ActionCreators
 *
 * @param ac - Single or array of ActionCreators
 * @param args - if an object is passed, verify it, else returns a function which does
 * @returns boolean indicating object is of type of action, if passing 2nd argument,
 *      or typeguard function
 */
export function isActionOf<AC extends ActionsUnionConstraint>(ac: AC, ...args: any[]) {
  function _isActionOf(this: ActionsUnionConstraint, action: unknown): boolean {
    if (typeof this === 'function') return (this as AnyAC).is(action);
    if (Array.isArray(this)) return this.some((a) => a.is(action));
    if (typeof this === 'object') return _isActionOf.call(Object.values(this), action);
    return false;
  }
  if (args.length > 0) return _isActionOf.call(ac, args[0]);
  return _isActionOf.bind(ac);
}

/*** Async Actions ***/

/**
 * Maps parameters for createAsyncAction to respective async ActionCreators (request, success and
 * failure)
 */
type AsyncActionCreator<
  P extends readonly [
    meta: t.Mixed,
    type: string,
    request?: t.Mixed,
    success?: t.Mixed,
    failure?: t.Mixed,
  ],
> = {
  readonly request: ActionCreatorFromTuple<[`${P[1]}/request`, P[2], P[0]]>;
  readonly success: ActionCreatorFromTuple<[`${P[1]}/success`, P[3], P[0]]>;
  readonly failure: ActionCreatorFromTuple<
    [`${P[1]}/failure`, P[4] extends t.Mixed ? P[4] : t.UnknownC, P[0], true]
  >;
};

/**
 * A type which constrains any async ActionCreator tuple
 */
export type AnyAAC = {
  readonly request: ActionCreator<{
    readonly type: `${string}/request`;
    readonly payload?: any;
    readonly meta: any;
  }>;
  readonly success: ActionCreator<{
    readonly type: `${string}/success`;
    readonly payload?: any;
    readonly meta: any;
  }>;
  readonly failure: ActionCreator<{
    readonly type: `${string}/failure`;
    readonly payload: unknown;
    readonly meta: any;
    readonly error: true;
  }>;
};

/**
 * Create a set of async actions
 *
 * Here, meta is first class citizen, as it's required and what links a request with its responses
 * (success or failure).
 *
 * @param args - Arguments tuple; [meta, type] are required, while [request, success an failure]
 *      are codecs to be used as payloads for the respective ActionCreators
 * @returns Async actions
 */
export function createAsyncAction<
  P extends readonly [
    meta: t.Mixed,
    type: string,
    request?: t.Mixed,
    success?: t.Mixed,
    failure?: t.Mixed,
  ],
>(...args: P): AsyncActionCreator<P> {
  return {
    request: createAction(`${args[1]}/request`, args[2] as P[2], args[0] as P[0]),
    success: createAction(
      `${args[1]}/success` as `${P[1]}/success`,
      args[3] as P[3],
      args[0] as P[0],
    ),
    failure: createAction(
      `${args[1]}/failure` as `${P[1]}/failure`,
      (args[4] ?? t.unknown) as P[4] extends t.Mixed ? P[4] : t.UnknownC,
      args[0] as P[0],
      true,
    ),
  } as AsyncActionCreator<P>;
}

// curried overloads
function matchMeta(meta: any, action: { meta: any }): boolean;
function matchMeta(meta: any): (action: { meta: any }) => boolean;

/**
 * Match a passed meta with an action if returns true if metas are from corresponding actions
 *
 * curried (arity=2) for action passed as 2nd param.
 *
 * @param meta - meta base for comparison
 * @param args - curried args array
 * @returns true if metas are compatible, false otherwise
 */
function matchMeta(meta: any, ...args: [{ meta: any }] | []) {
  const _match = (action: { meta: any }): boolean =>
    // like isEqual, but for BigNumbers, use .eq
    isMatchWith(action.meta, meta, (objVal, othVal) =>
      // any is to avoid lodash's issue with undefined-returning isMatchWithCustomizer cb type
      BigNumberC.is(objVal) && BigNumberC.is(othVal) ? objVal.eq(othVal) : (undefined as any),
    );
  if (args.length) return _match(args[0]);
  return _match;
}

// curried overloads
export function isResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
): (action: unknown) => action is ActionType<AAC['success'] | AAC['failure']>;
export function isResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action: unknown,
): action is ActionType<AAC['success'] | AAC['failure']>;

/**
 * Given an AsyncActionCreator and a respective 'meta' object, returns a type guard function for
 * responses actions (success|failure) matching given 'meta'
 *
 * This function receives 2-3 params. If it receives 2, it returns the type guard function, to be
 * used for filtering. Otherwise, it performs the check on the 3rd param.
 *
 * @param asyncAction - AsyncActionCreator object
 * @param meta - meta object to filter matching actions
 * @param args - curried last param
 * @returns type guard function to filter deep-equal meta success|failure actions
 */
export function isResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  ...args: [unknown] | []
) {
  const _isResponseOf = (action: unknown): action is ActionType<AAC['success'] | AAC['failure']> =>
    isActionOf([asyncAction.success, asyncAction.failure], action) && matchMeta(meta, action);

  if (args.length) return _isResponseOf(args[0]);
  return _isResponseOf;
}

// curried overloads
export function isConfirmationResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action: unknown,
): action is
  | (ActionType<AAC['success']> & { payload: { confirmed: boolean } })
  | ActionType<AAC['failure']>;
export function isConfirmationResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
): (
  action: unknown,
) => action is
  | (ActionType<AAC['success']> & { payload: { confirmed: boolean } })
  | ActionType<AAC['failure']>;

/**
 * Like isResponseOf, but ignores non-confirmed (or removed by a reorg) success action
 *
 * Confirmable success actions are emitted twice: first with payload.confirmed=undefined, then with
 * either confirmed=true, if tx still present after confirmation blocks, or confirmed=false, if tx
 * was removed from blockchain by a reorg.
 * This curied helper filter function ensures only one of the later causes a positive filter.
 *
 * @param asyncAction - AsyncActionCreator object
 * @param meta - meta object to filter matching actions
 * @param args - curried last param
 * @returns type guard function to filter deep-equal meta success|failure actions
 */
export function isConfirmationResponseOf<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  ...args: [unknown] | []
) {
  /**
   * @param action - action to check
   * @returns boolean indicating whether object is confirmation
   */
  function _isConfirmation(action: unknown): action is { payload: { confirmed: boolean } } {
    return typeof (action as any)?.['payload']?.['confirmed'] === 'boolean';
  }
  const _isResponseOf = (
    action: unknown,
  ): action is
    | (ActionType<AAC['success']> & { payload: { confirmed: boolean } })
    | ActionType<AAC['failure']> =>
    isResponseOf(asyncAction, meta, action) &&
    (asyncAction.failure.is(action) || _isConfirmation(action));

  if (args.length) return _isResponseOf(args[0]);
  return _isResponseOf;
}

export function asyncActionToPromise<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action$: Observable<Action>,
): Promise<ActionType<AAC['success']>['payload']>;
export function asyncActionToPromise<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action$: Observable<Action>,
  confirmed: false,
): Promise<
  ActionType<AAC['success']>['payload'] & {
    txBlock: number;
    txHash: Hash;
    confirmed: undefined | boolean;
  }
>;
export function asyncActionToPromise<AAC extends AnyAAC>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action$: Observable<Action>,
  confirmed: true,
): Promise<
  ActionType<AAC['success']>['payload'] & { txBlock: number; txHash: Hash; confirmed: true }
>;

/**
 * Watch a stream of actions and resolves on meta-matching success or rejects on failure
 *
 * @param asyncAction - async actions object to wait for
 * @param meta - meta object of a request to wait for the respective response
 * @param action$ - actions stream to watch for responses
 * @param confirmed - undefined for any response action, false to filter confirmable actions,
 *  true for confirmed ones
 * @returns Promise which rejects with payload in case of failure, or resolves payload otherwise
 */
export async function asyncActionToPromise<
  AAC extends AsyncActionCreator<[t.Mixed, any, any, t.Mixed, t.Mixed]>,
>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action$: Observable<Action>,
  confirmed?: boolean,
) {
  return firstValueFrom(
    action$.pipe(
      filter(
        confirmed
          ? isConfirmationResponseOf<AAC>(asyncAction, meta)
          : isResponseOf<AAC>(asyncAction, meta),
      ),
      filter(
        (action) =>
          confirmed === undefined ||
          !asyncAction.success.is(action) ||
          'confirmed' in action.payload,
      ),
      take(1),
      map((action) => {
        if (asyncAction.failure.is(action))
          throw action.payload as ActionType<AAC['failure']>['payload'];
        else if (action.payload?.confirmed === false)
          throw new RaidenError(ErrorCodes.RDN_TRANSACTION_REORG, {
            transactionHash: action.payload.txHash!,
          });
        return action.payload as ActionType<AAC['success']>['payload'];
      }),
    ),
    { defaultValue: undefined },
  );
}

// createReducer

/**
 * Create a reducer which can be extended with additional actions handlers
 *
 * Usage:
 *   const reducer = createReducer(State)
 *      .handle(action, (s, a): State => ...)
 *      .handle(...)
 *      .handle(...);
 *
 * @param initialState - state for initialization (if no state is passed on reducer call)
 * @returns A reducer function, extended with a handle method to extend it
 */
export function createReducer<S, A extends Action = Action>(initialState: S) {
  type Handlers = {
    [type: string]: [AnyAC, (state: S, action: A) => S];
  };
  type Handler<AC extends AnyAC> = (state: S, action: ActionType<AC>) => S;
  // allows to constrain a generic to not already be part of an union
  type NotHandled<ACs, AC extends AnyAC> = AC extends ACs ? never : AC;

  type HandleNew<ACs> = <
    AC extends AnyAC & NotHandled<ACs, AD>,
    H extends Handler<AC>,
    AD extends AnyAC = AC,
  >(
    ac: AC | readonly AC[],
    handler: H,
  ) => ExtReducer<ACs | AC>;
  type ExtReducer<ACs> = Reducer<S, A> & { handle: HandleNew<ACs> };

  /**
   * Make a reducer function for given handlers
   *
   * @param handlers - handlers to put into the reducer
   * @returns reducer function for given handlers
   */
  function makeReducer<ACs>(handlers: Handlers): ExtReducer<ACs> {
    const reducer: Reducer<S, A> = (state: S = initialState, action: A) => {
      if (action.type in handlers && handlers[action.type][0].is(action))
        return handlers[action.type][1](state, action); // calls registered handler
      return state; // fallback returns unchanged state
    };

    /**
     * Circular dependency on generic params forbids an already handled action from being accepted
     *
     * @param ac - Single or array of ActionCreators
     * @param handler - handler to use
     * @returns reducer with the action created incorporated
     */
    function handle<
      AC extends AnyAC & NotHandled<ACs, AD>,
      H extends Handler<AC>,
      AD extends AnyAC = AC,
    >(ac: AC | readonly AC[], handler: H) {
      const arr = Array.isArray(ac) ? ac : [ac];
      assert(!arr.some((a) => a.type in handlers), 'Already handled');
      return makeReducer<ACs | AC>(
        Object.assign({}, handlers, ...arr.map((ac) => ({ [ac.type]: [ac, handler] }))),
      );
    }
    // grow reducer function with our `handle` extender
    return Object.assign(reducer, { handle }) as ExtReducer<ACs>;
  }
  // initially makes a reducer which doesn't handle anything (just returns unchanged state)
  return makeReducer<never>({});
}
