/**
 * Aggregate types and exported properties from actions from all modules
 */
import { chain } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import * as t from 'io-ts';
import mapKeys from 'lodash/mapKeys';
import property from 'lodash/property';
import reduce from 'lodash/reduce';

import * as ChannelsActions from './channels/actions';
import { PartialRaidenConfig } from './config';
import { ShutdownReason } from './constants';
import * as MessagesActions from './messages/actions';
import * as ServicesActions from './services/actions';
import * as TransfersActions from './transfers/actions';
import * as TransportActions from './transport/actions';
import { Caps } from './transport/types';
import type { Action, ActionsUnion, ActionType, ActionTypeOf, AnyAC } from './utils/actions';
import { createAction } from './utils/actions';
import { ErrorCodec } from './utils/error';
import { Hash } from './utils/types';

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

export const raidenConfigCaps = createAction(
  'raiden/config/caps',
  t.type({ caps: t.union([Caps, t.null]) }),
);
export interface raidenConfigCaps extends ActionType<typeof raidenConfigCaps> {}

export const raidenStarted = createAction('raiden/started');
export interface raidenStarted extends ActionType<typeof raidenStarted> {}

export const raidenSynced = createAction(
  'raiden/synced',
  t.type({ tookMs: t.number, initialBlock: t.number, currentBlock: t.number }),
);
export interface raidenSynced extends ActionType<typeof raidenSynced> {}

const RaidenActions = {
  raidenShutdown,
  raidenConfigUpdate,
  raidenConfigCaps,
  raidenStarted,
  raidenSynced,
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
  RaidenActions.udcWithdrawPlan.success,
  RaidenActions.udcWithdrawPlan.failure,
  RaidenActions.udcWithdraw.success,
  RaidenActions.udcWithdraw.failure,
  RaidenActions.msBalanceProofSent,
  RaidenActions.channelSettle.success,
  RaidenActions.channelSettle.failure,
  RaidenActions.channelOpen.success,
  RaidenActions.channelOpen.failure,
];
/* Tagged union of RaidenEvents actions */
export type RaidenEvent = ActionType<typeof RaidenEvents>;

type UnionToActionsMap<T extends AnyAC> = {
  readonly [K in ActionTypeOf<T>]: Extract<T, { readonly type: K }>;
};

// type and object mapping from every action type to its ActionCreator object
type RaidenActionsMap = UnionToActionsMap<ActionsUnion<typeof RaidenActions>>;
const RaidenActionsMap = reduce(
  RaidenActions,
  (acc, v) => ({ ...acc, ...('type' in v ? { [v.type]: v } : mapKeys(v, property('type'))) }),
  {} as Partial<RaidenActionsMap>,
) as RaidenActionsMap;

/**
 * Pure codec which decodes/validates actions which can be confirmed on-chain
 *
 * Note that this isn't a complete ActionCreator, but it helps identify and narrow actions which
 * matches this schema. Also important is that this codec isn't `t.exact`, and therefore it will
 * validate objects with additional properties (like meta and payload properties), as long as it
 * matches the required schema below.
 * Use [[ConfirmableAction]] to ensure it both complies with and decodes/validates also to the
 * actual corresponding action registered in [[RaidenActionsMap]]
 */
const _ConfirmableAction = t.readonly(
  t.type({
    type: t.string,
    payload: t.type({
      txHash: Hash,
      txBlock: t.number,
      confirmed: t.union([t.undefined, t.boolean]),
    }),
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
    pipe(
      _ConfirmableAction.validate(u, c),
      chain((v) => {
        const type = v.type as keyof RaidenActionsMap;
        if (!(type in RaidenActionsMap)) return t.failure(v, c);
        return RaidenActionsMap[type].codec.validate(v, c) as t.Validation<ConfirmableAction>;
      }),
    ),
  (a) => RaidenActionsMap[a.type as keyof RaidenActionsMap].codec.encode(a) as ConfirmableAction,
);
