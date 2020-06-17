/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Aggregate types and exported properties from actions from all modules
 */
import * as t from 'io-ts';
import { either, Either } from 'fp-ts/lib/Either';
import mapKeys from 'lodash/mapKeys';
import property from 'lodash/property';
import reduce from 'lodash/reduce';

import { ShutdownReason } from './constants';
import { PartialRaidenConfig } from './config';
import { ActionType, createAction, Action, AnyAC, TTypeOf, ActionCreator } from './utils/actions';
import { ErrorCodec } from './utils/error';
import { Hash } from './utils/types';

import * as ChannelsActions from './channels/actions';
import * as TransportActions from './transport/actions';
import * as MessagesActions from './messages/actions';
import * as TransfersActions from './transfers/actions';
import * as ServicesActions from './services/actions';

export const raidenShutdown = createAction(
  'raiden/shutdown',
  t.type({
    reason: t.union([
      t.literal(ShutdownReason.STOP),
      t.literal(ShutdownReason.ACCOUNT_CHANGED),
      t.literal(ShutdownReason.NETWORK_CHANGED),
      ErrorCodec,
    ]),
  }),
);
export interface raidenShutdown extends ActionType<typeof raidenShutdown> {}

export const raidenConfigUpdate = createAction('raiden/config/update', PartialRaidenConfig);
export interface raidenConfigUpdate extends ActionType<typeof raidenConfigUpdate> {}

const RaidenActions = {
  raidenShutdown,
  raidenConfigUpdate,
  ...ChannelsActions,
  ...TransportActions,
  ...MessagesActions,
  ...TransfersActions,
  ...ServicesActions,
};

/* Tagged union of all action types from the action creators */
// export type RaidenAction = ActionType<typeof RaidenActions>;
export type RaidenAction = Action;

/* Mapping { [type: string]: Action } of a subset of RaidenActions exposed as events */
export const RaidenEvents = [
  RaidenActions.raidenShutdown,
  RaidenActions.newBlock,
  RaidenActions.matrixPresence.success,
  RaidenActions.tokenMonitored,
  RaidenActions.udcWithdrawn,
  RaidenActions.udcWithdraw.failure,
  RaidenActions.msBalanceProofSent,
];
/* Tagged union of RaidenEvents actions */
export type RaidenEvent = ActionType<typeof RaidenEvents>;

type ValueOf<T> = T[keyof T];
type UnionToActionsMap<T extends AnyAC> = {
  [K in TTypeOf<T>]: Extract<T, ActionCreator<K, any, any, any>>;
};
// receives an actions module/mapping, where values can be either ACs or AACs, and return a mapping
// type where ACs are flattened from AACs and keys are their type tag literals
type ActionsMap<T extends Record<string, AnyAC | Record<string, AnyAC>>> = UnionToActionsMap<
  ValueOf<
    {
      [K in keyof T]: T[K] extends AnyAC
        ? T[K]
        : T[K] extends Record<string, AnyAC>
        ? ValueOf<T[K]>
        : never;
    }
  >
>;

// type and object mapping from every action type to its ActionCreator object
type RaidenActionsMap = Readonly<ActionsMap<typeof RaidenActions>>;
const RaidenActionsMap = reduce(
  RaidenActions,
  (acc, v) => ({ ...acc, ...('type' in v ? { [v.type]: v } : mapKeys(v, property('type'))) }),
  {} as Partial<RaidenActionsMap>,
) as RaidenActionsMap;

/**
 * Pure codec which decodes/validates actions which can be confirmed on-chain
 *
 * Note that this isn't a complete ActionCreator, but it helps identify and narrow actions which
 * matches this schema. Also important is that this codec isn't `t.exact`, and therefore it wil
 * validate objects with additional properties (like meta and payload properties), as long as it
 * matches the required schema below.
 * Use [[ConfirmableAction]] to ensure it both complies with and decodes/validates also to the
 * actual corresponding action registered in [[RaidenActionsMap]]
 */
const _ConfirmableAction = t.readonly(
  t.type({
    type: t.string,
    payload: t.readonly(
      t.type({
        txHash: Hash,
        txBlock: t.number,
        confirmed: t.union([t.undefined, t.boolean]),
      }),
    ),
  }),
);
/** The type of a confirmable action object. */
export type ConfirmableAction = t.TypeOf<typeof _ConfirmableAction>;

/**
 * Special custom codec with validates a type equivalent to:
 * ConfirmableAction & ValueOf<RaidenActionsMap>
 * i.e. a ConfirmableAction intersected with an union of any possible registered RaidenAction.
 * This is needed in order to properly handle members of actions which require special encoding/
 * decoding logic, like BigNumbers, otherwise when decoding actions (e.g. from
 * RaidenState['pendingTxs']), the members would be kept but not decoded properly.
 */
export const ConfirmableAction = new t.Type<
  ConfirmableAction,
  { type: string; payload: { txHash: string; txBlock: number; confirmed: boolean | undefined } }
>(
  'ConfirmableAction',
  _ConfirmableAction.is,
  (u, c) =>
    either.chain(_ConfirmableAction.validate(u, c), (v) => {
      const type = v.type as keyof RaidenActionsMap;
      if (!(type in RaidenActionsMap)) return t.failure(v, c);
      return RaidenActionsMap[type].codec.validate(v, c) as Either<t.Errors, ConfirmableAction>;
    }),
  (a) =>
    RaidenActionsMap[a.type as keyof RaidenActionsMap].codec.encode(a as any) as ConfirmableAction,
);
