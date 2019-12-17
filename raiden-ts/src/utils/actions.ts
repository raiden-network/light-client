/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';

/**
 * The type of a generic action
 */
export type Action<TType extends string = string> = { type: TType };

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
    return action != null && arr.some(a => a.is(action));
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
 * @param args.0 - type literal string tag for action
 * @param args.1 - payload codec, optional
 * @param args.2 - meta codec, optional
 * @param args.3 - error flag, will only be present if defined (either false or true)
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
  return Object.assign(
    (payload?: t.TypeOf<NonNullable<TPayload>>, meta?: t.TypeOf<NonNullable<TMeta>>) => ({
      type,
      ...(payloadC ? { payload } : null),
      ...(metaC ? { meta } : null),
      ...(error !== undefined ? { error } : null),
    }),
    { codec, type, is },
    error !== undefined ? { error } : null,
  ) as ActionCreator<TType, TPayload, TMeta, TError>;
}
