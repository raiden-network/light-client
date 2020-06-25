/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import isMatchWith from 'lodash/isMatchWith';
import { Observable } from 'rxjs';
import { first, map } from 'rxjs/operators';

import { assert } from '../utils';
import { RaidenError, ErrorCodes } from '../utils/error';
import { BigNumberC } from './types';

/**
 * The type of a generic action
 */
export type Action<TType extends string = string> = { type: TType };
export type Reducer<S = any, A extends Action = Action> = (state: S | undefined, action: A) => S;

/**
 * The ActionCreator's ReturnType, equivalent but more efficient than t.TypeOf<ActionCodec>
 */
type _Action<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = TError extends boolean
  ? TMeta extends t.Mixed
    ? TPayload extends t.Mixed
      ? {
          type: TType;
          payload: TPayload['_A'];
          meta: TMeta['_A'];
          error: TError;
        }
      : { type: TType; meta: TMeta['_A']; error: TError }
    : TPayload extends t.Mixed
    ? { type: TType; payload: TPayload['_A']; error: TError }
    : { type: TType; error: TError }
  : TMeta extends t.Mixed
  ? TPayload extends t.Mixed
    ? { type: TType; payload: TPayload['_A']; meta: TMeta['_A'] }
    : { type: TType; meta: TMeta['_A'] }
  : TPayload extends t.Mixed
  ? { type: TType; payload: TPayload['_A'] }
  : { type: TType };

/**
 * The codec of an ActionCreator, from type tag, payloadCodec, metaCodec & error boolean
 */
type ActionCodec<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = TError extends boolean
  ? TMeta extends t.Mixed
    ? TPayload extends t.Mixed
      ? t.TypeC<{
          type: t.LiteralC<TType>;
          payload: TPayload;
          meta: TMeta;
          error: t.LiteralC<TError>;
        }>
      : t.TypeC<{ type: t.LiteralC<TType>; meta: TMeta; error: t.LiteralC<TError> }>
    : TPayload extends t.Mixed
    ? t.TypeC<{ type: t.LiteralC<TType>; payload: TPayload; error: t.LiteralC<TError> }>
    : t.TypeC<{ type: t.LiteralC<TType>; error: t.LiteralC<TError> }>
  : TMeta extends t.Mixed
  ? TPayload extends t.Mixed
    ? t.TypeC<{ type: t.LiteralC<TType>; payload: TPayload; meta: TMeta }>
    : t.TypeC<{ type: t.LiteralC<TType>; meta: TMeta }>
  : TPayload extends t.Mixed
  ? t.TypeC<{ type: t.LiteralC<TType>; payload: TPayload }>
  : t.TypeC<{ type: t.LiteralC<TType> }>;

/**
 * The factory function part of an ActionCreator
 */
type ActionFactory<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = TPayload extends t.Mixed
  ? TMeta extends t.Mixed
    ? (
        payload: t.TypeOf<TPayload>,
        meta: t.TypeOf<TMeta>,
      ) => _Action<TType, TPayload, TMeta, TError>
    : (payload: t.TypeOf<TPayload>) => _Action<TType, TPayload, TMeta, TError>
  : TMeta extends t.Mixed
  ? (_: undefined, meta: t.TypeOf<TMeta>) => _Action<TType, TPayload, TMeta, TError>
  : () => _Action<TType, TPayload, TMeta, TError>;

/**
 * The ActionCreator member properties part which can be introspected
 * - type: tag string literal
 * - codec: the 'io-ts' codec/validator of the action
 * - is: member typeguard function. Notice at production, for performance reasons, it checks only
 *      the 'type' tag. If one needs explicit full validation, use codec.is/codec.decode directly
 * - error: boolean literal, present only if it's an error action (false or true)
 */
type ActionCreatorMembers<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = {
  codec: ActionCodec<TType, TPayload, TMeta, TError>;
  type: TType;
  is: (action: unknown) => action is _Action<TType, TPayload, TMeta, TError>;
} & (TError extends boolean ? { error: TError } : {});

/**
 * ActionCreator type, factory function extended (intersection) with members
 */
export type ActionCreator<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = ActionFactory<TType, TPayload, TMeta, TError> &
  ActionCreatorMembers<TType, TPayload, TMeta, TError>;

export type AnyAC = ActionCreator<any, any, any, any>;
export type TTypeOf<T> = T extends ActionCreator<infer TType, any, any, any> ? TType : never;

/**
 * Type helper to extract the type of an action or a mapping of actions
 * Usage: const action: ActionType<typeof actionCreator>;
 */
export type ActionType<Creators> = Creators extends ActionCreator<
  infer TType,
  infer TPayload,
  infer TMeta,
  infer TError
>
  ? _Action<TType, TPayload, TMeta, TError>
  : Creators extends any[]
  ? {
      [K in keyof Creators]: ActionType<Creators[K]>;
    }[number]
  : Creators extends Record<any, any>
  ? {
      [K in keyof Creators]: ActionType<Creators[K]>;
    }[keyof Creators]
  : never;

// isActionOf curry overloads
export function isActionOf<AC extends ActionCreator<any, any, any, any>>(
  ac: AC | AC[],
  action: unknown,
): action is ReturnType<AC>;
export function isActionOf<AC extends ActionCreator<any, any, any, any>>(
  ac: AC | AC[],
): (action: unknown) => action is ReturnType<AC>;

/**
 * Curried typeguard function (arity=2) which validates 2nd param is of type of some ActionCreators
 *
 * @param ac - Single or array of ActionCreators
 * @param args - if an object is passed, verify it, else returns a function which does
 * @returns boolean indicating object is of type of action, if passing 2nd argument,
 *      or typeguard function
 */
export function isActionOf<AC extends ActionCreator<any, any, any, any>>(
  ac: AC | AC[],
  ...args: any[]
) {
  const arr = Array.isArray(ac) ? ac : [ac];
  function _isActionOf(action: unknown): action is ReturnType<AC> {
    return action != null && arr.some((a) => a.is(action));
  }
  if (args.length > 0) return _isActionOf(args[0]);
  return _isActionOf;
}

/**
 * Tuples for typesafe params/arguments for createAction function
 */
type ActionParams<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
> = TError extends boolean
  ? TMeta extends t.Mixed
    ? TPayload extends t.Mixed
      ? [TType, TPayload, TMeta, TError]
      : [TType, undefined, TMeta, TError]
    : TPayload extends t.Mixed
    ? [TType, TPayload, undefined, TError]
    : [TType, undefined, undefined, TError]
  : TMeta extends t.Mixed
  ? TPayload extends t.Mixed
    ? [TType, TPayload, TMeta]
    : [TType, undefined, TMeta]
  : TPayload extends t.Mixed
  ? [TType, TPayload]
  : [TType];

// overloads with correct number of parameters
export function createAction<TType extends string>(type: TType): ActionCreator<TType>;
export function createAction<TType extends string, TPayload extends t.Mixed | undefined>(
  type: TType,
  payload: TPayload,
): ActionCreator<TType, TPayload>;
export function createAction<
  TType extends string,
  TPayload extends t.Mixed | undefined,
  TMeta extends t.Mixed | undefined
>(type: TType, payload: TPayload, meta: TMeta): ActionCreator<TType, TPayload, TMeta>;
export function createAction<
  TType extends string,
  TPayload extends t.Mixed | undefined,
  TMeta extends t.Mixed | undefined,
  TError extends boolean | undefined
>(
  type: TType,
  payload: TPayload,
  meta: TMeta,
  error: TError,
): ActionCreator<TType, TPayload, TMeta, TError>;

/**
 * Create a typesafe, serializable ActionCreator from type, payload codec, meta codec & error flag
 *
 * Pass undefined for indermediary arguments if they aren't needed
 * e.g. action with meta and without payload:
 *   const addTodo = createAction('ADD_TODO', undefined, t.type({ folder: t.string }));
 *
 * @param args - typesafe args tuple
 * @returns ActionCreator factory function with useful properties. See [[ActionCreatorMembers]]
 */
export function createAction<
  TType extends string,
  TPayload extends t.Mixed | undefined = undefined,
  TMeta extends t.Mixed | undefined = undefined,
  TError extends boolean | undefined = undefined
>(
  ...args: ActionParams<TType, TPayload, TMeta, TError>
): ActionCreator<TType, TPayload, TMeta, TError> {
  const [type, payloadC, metaC, error] = args;
  // action codec
  const codec = t.type({
    type: t.literal(type),
    ...(payloadC ? { payload: payloadC } : null),
    ...(metaC ? { meta: metaC } : null),
    ...(error ? { error: t.literal(error) } : null),
  });
  // member typeguard
  // like codec.is, but on production, switches to more performant check of 'type' tag only
  const is =
    process.env.NODE_ENV === 'development'
      ? (action: unknown) => codec.is(action)
      : (action: unknown) => (action as any)?.['type'] === type;
  const members = { codec, type, is, ...(error !== undefined ? { error } : null) };
  const factory = (
    payload?: t.TypeOf<NonNullable<TPayload>>,
    meta?: t.TypeOf<NonNullable<TMeta>>,
  ) => ({
    type,
    ...(payloadC ? { payload } : null),
    ...(metaC ? { meta } : null),
    ...(error !== undefined ? { error } : null),
  });
  return Object.assign(factory, members) as ActionCreator<TType, TPayload, TMeta, TError>;
}

/*** Async Actions ***/

export type AsyncActionCreator<
  TMeta extends t.Mixed,
  TRequestType extends string,
  TSuccessType extends string,
  TFailureType extends string,
  TRequestPayload extends t.Mixed | undefined,
  TSuccessPayload extends t.Mixed | undefined,
  TFailurePayload extends t.Mixed | undefined = typeof t.any
> = {
  request: ActionCreator<TRequestType, TRequestPayload, TMeta>;
  success: ActionCreator<TSuccessType, TSuccessPayload, TMeta>;
  failure: ActionCreator<TFailureType, TFailurePayload, TMeta, true>;
};

export type AnyAAC = AsyncActionCreator<any, any, any, any, any, any, any>;

// overloads to account for the optional failure payload (defaults to t.any)
export function createAsyncAction<
  TMeta extends t.Mixed,
  TRequestType extends string,
  TSuccessType extends string,
  TFailureType extends string,
  TRequestPayload extends t.Mixed | undefined,
  TSuccessPayload extends t.Mixed | undefined
>(
  meta: TMeta,
  rtype: TRequestType,
  stype: TSuccessType,
  ftype: TFailureType,
  rpayload: TRequestPayload,
  spayload: TSuccessPayload,
): AsyncActionCreator<
  TMeta,
  TRequestType,
  TSuccessType,
  TFailureType,
  TRequestPayload,
  TSuccessPayload,
  typeof t.any
>;
export function createAsyncAction<
  TMeta extends t.Mixed,
  TRequestType extends string,
  TSuccessType extends string,
  TFailureType extends string,
  TRequestPayload extends t.Mixed | undefined,
  TSuccessPayload extends t.Mixed | undefined,
  TFailurePayload extends t.Mixed | undefined
>(
  meta: TMeta,
  rtype: TRequestType,
  stype: TSuccessType,
  ftype: TFailureType,
  rpayload: TRequestPayload,
  spayload: TSuccessPayload,
  fpayload: TFailurePayload,
): AsyncActionCreator<
  TMeta,
  TRequestType,
  TSuccessType,
  TFailureType,
  TRequestPayload,
  TSuccessPayload,
  TFailurePayload
>;

/**
 * Create a set of async actions
 *
 * Here, meta is first class citizen, as it's required and what links a request with its responses
 * (success or failure).
 * An 'isResponseOf' member function is provided which accepts 'meta' (e.g. from request) and
 * returns a type guard function/filter which returns true only if passed a respective deep-equal
 * 'meta' success|failure action.
 *
 * @param meta - Meta object common to these async actions
 * @param rtype - Request literal string tag
 * @param stype - Success literal string tag
 * @param ftype - Failure literal string tag
 * @param rpayload - Request payload codec
 * @param spayload - Success payload codec
 * @param args - Optional fpayload - Failure payload codec, defaults to t.any
 * @returns Async actions
 */
export function createAsyncAction<
  TMeta extends t.Mixed,
  TRequestType extends string,
  TSuccessType extends string,
  TFailureType extends string,
  TRequestPayload extends t.Mixed | undefined,
  TSuccessPayload extends t.Mixed | undefined,
  TFailurePayload extends t.Mixed | undefined = typeof t.any
>(
  meta: TMeta,
  rtype: TRequestType,
  stype: TSuccessType,
  ftype: TFailureType,
  rpayload: TRequestPayload,
  spayload: TSuccessPayload,
  ...args: TFailurePayload extends typeof t.any ? [TFailurePayload] | [] : [TFailurePayload]
): AsyncActionCreator<
  TMeta,
  TRequestType,
  TSuccessType,
  TFailureType,
  TRequestPayload,
  TSuccessPayload,
  TFailurePayload
> {
  const fpayload = args.length ? (args[0] as TFailurePayload) : t.any;
  const request = createAction(rtype, rpayload, meta);
  const success = createAction(stype, spayload, meta);
  const failure = createAction(ftype, fpayload, meta, true) as ActionCreator<
    TFailureType,
    TFailurePayload,
    TMeta,
    true
  >;
  return { request, success, failure };
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
export function isResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action: unknown,
): action is ActionType<AAC['success'] | AAC['failure']>;
export function isResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
): (action: unknown) => action is ActionType<AAC['success'] | AAC['failure']>;

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
export function isResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(asyncAction: AAC, meta: ActionType<AAC['request']>['meta'], ...args: [unknown] | []) {
  const _isResponseOf = (action: unknown): action is ActionType<AAC['success'] | AAC['failure']> =>
    isActionOf([asyncAction.success, asyncAction.failure], action) && matchMeta(meta, action);

  if (args.length) return _isResponseOf(args[0]);
  return _isResponseOf;
}

// curried overloads
export function isConfirmationResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action: unknown,
): action is
  | (ActionType<AAC['success']> & { payload: { confirmed: boolean } })
  | ActionType<AAC['failure']>;
export function isConfirmationResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(
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
export function isConfirmationResponseOf<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, any, any>
>(asyncAction: AAC, meta: ActionType<AAC['request']>['meta'], ...args: [unknown] | []) {
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

/**
 * Watch a stream of actions and resolves on meta-matching success or rejects on failure
 *
 * @param asyncAction - async actions object to wait for
 * @param meta - meta object of a request to wait for the respective response
 * @param action$ - actions stream to watch for responses
 * @param confirmed - set if should ignore non-confirmed success response
 * @returns Promise which rejects with payload in case of failure, or resolves payload otherwise
 */
export async function asyncActionToPromise<
  AAC extends AsyncActionCreator<t.Mixed, any, any, any, any, t.Mixed, t.Mixed>
>(
  asyncAction: AAC,
  meta: ActionType<AAC['request']>['meta'],
  action$: Observable<Action>,
  confirmed = false,
) {
  return action$
    .pipe(
      first(
        confirmed
          ? isConfirmationResponseOf<AAC>(asyncAction, meta)
          : isResponseOf<AAC>(asyncAction, meta),
      ),
      map((action) => {
        if (asyncAction.failure.is(action))
          throw action.payload as ActionType<AAC['failure']>['payload'];
        else if (action.payload.confirmed === false)
          throw new RaidenError(ErrorCodes.RDN_TRANSACTION_REORG, {
            transactionHash: action.payload.txHash!,
          });
        return action.payload as ActionType<AAC['success']>['payload'];
      }),
    )
    .toPromise();
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
  /**
   * A simplified schema for ActionCreator<any, any, any, any>, to optimize createReducer
   */
  type AnyAC = ((payload: any, meta: any) => Action) & {
    type: string;
    is: (action: unknown) => action is Action;
  };
  // generic handlers as a indexed type for `makeReducer`
  type Handlers = {
    [type: string]: [AnyAC, (state: S, action: A) => S];
  };
  type Handler<AC extends AnyAC> = (state: S, action: ActionType<AC>) => S;
  // allows to constrain a generic to not already be part of an union
  type NotHandled<ACs, AC extends AnyAC> = AC extends ACs ? never : AC;

  // workaround for "Type instantiation is excessively deep and possibly infinite" error
  // see https://stackoverflow.com/questions/60265325/using-recursive-type-alias-in-generic-results-in-error
  type I = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
  type Iterate<A extends I = 0> = A extends 0
    ? 1
    : A extends 1
    ? 2
    : A extends 2
    ? 3
    : A extends 3
    ? 4
    : A extends 4
    ? 5
    : A extends 5
    ? 6
    : A extends 6
    ? 7
    : A extends 7
    ? 8
    : A extends 8
    ? 9
    : A extends 9
    ? 10
    : A extends 10
    ? 11
    : A extends 11
    ? 12
    : A extends 12
    ? 13
    : A extends 13
    ? 14
    : A extends 14
    ? 15
    : 15;

  type ExtReducer<ACs, X extends I = 0> = X extends 15
    ? Reducer<S, A>
    : Reducer<S, A> & {
        handle: <
          AC extends AnyAC & NotHandled<ACs, AD>,
          H extends Handler<AC>,
          AD extends AnyAC = AC
        >(
          ac: AC | AC[],
          handler: H,
        ) => ExtReducer<ACs | AC, Iterate<X>>;
      };

  // make a reducer function for given handlers
  function makeReducer<ACs, X extends I = 0>(handlers: Handlers): ExtReducer<ACs, X> {
    const reducer: Reducer<S, A> = (state: S = initialState, action: A) => {
      if (action.type in handlers && handlers[action.type][0].is(action))
        return handlers[action.type][1](state, action); // calls registered handler
      return state; // fallback returns unchanged state
    };
    // circular dependency on generic params forbids an already handled action from being accepted
    function handle<
      AC extends AnyAC & NotHandled<ACs, AD>,
      H extends Handler<AC>,
      AD extends AnyAC = AC
    >(ac: AC | AC[], handler: H) {
      const arr = Array.isArray(ac) ? ac : [ac];
      assert(!arr.some((a) => a.type in handlers), 'Already handled');
      return makeReducer<ACs | AC, Iterate<X>>(
        Object.assign({}, handlers, ...arr.map((ac) => ({ [ac.type]: [ac, handler] }))),
      );
    }
    // grow reducer function with our `handle` extender
    return Object.assign(reducer, { handle }) as ExtReducer<ACs, X>;
  }
  // initially makes a reducer which doesn't handle anything (just returns unchanged state)
  return makeReducer<never>({});
}
