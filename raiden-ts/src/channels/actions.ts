/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { createAction, ActionType } from '../utils/actions';
import { Address, Hash, UInt, ErrorCodec } from '../utils/types';

// interfaces need to be exported, and we need/want to support `import * as RaidenActions`
const ChannelId = t.type({
  tokenNetwork: Address,
  partner: Address,
});

/* A new head in the blockchain is detected by provider */
export const newBlock = createAction('newBlock', t.type({ blockNumber: t.number }));
export interface newBlock extends ActionType<typeof newBlock> {}

/**
 * A new token network is detected in the TokenNetworkRegistry instance
 * fromBlock is only set on the first time, to fetch and handle past events
 */
export const tokenMonitored = createAction(
  'tokenMonitored',
  t.intersection([
    t.type({
      token: Address,
      tokenNetwork: Address,
    }),
    t.partial({
      fromBlock: t.number,
    }),
  ]),
);
export interface tokenMonitored extends ActionType<typeof tokenMonitored> {}

/**
 * Channel actions receive ChannelId as 'meta' action property
 * This way, 'meta' can be used equally for request, success and error actions
 */

/* Request a channel to be opened with meta={ tokenNetwork, partner } and payload.settleTimeout */
export const channelOpen = createAction(
  'channelOpen',
  t.partial({ settleTimeout: t.number, subkey: t.boolean }),
  ChannelId,
);
export interface channelOpen extends ActionType<typeof channelOpen> {}

/* A channel is detected on-chain. Also works as 'success' for channelOpen action */
export const channelOpened = createAction(
  'channelOpened',
  t.type({
    id: t.number,
    settleTimeout: t.number,
    openBlock: t.number,
    isFirstParticipant: t.boolean,
    txHash: Hash,
  }),
  ChannelId,
);
export interface channelOpened extends ActionType<typeof channelOpened> {}

/* A channelOpen request action (with meta: ChannelId) failed with payload=Error */
export const channelOpenFailed = createAction('channelOpenFailed', ErrorCodec, ChannelId, true);
export interface channelOpenFailed extends ActionType<typeof channelOpenFailed> {}

/* Channel with meta:ChannelId + payload.id should be monitored */
export const channelMonitored = createAction(
  'channelMonitored',
  t.intersection([t.type({ id: t.number }), t.partial({ fromBlock: t.number })]),
  ChannelId,
);
export interface channelMonitored extends ActionType<typeof channelMonitored> {}

/* Request a payload.deposit to be made to channel meta:ChannelId */
export const channelDeposit = createAction(
  'channelDeposit',
  t.intersection([t.type({ deposit: UInt(32) }), t.partial({ subkey: t.boolean })]),
  ChannelId,
);
export interface channelDeposit extends ActionType<typeof channelDeposit> {}

/* A deposit is detected on-chain. Also works as 'success' for channelDeposit action */
export const channelDeposited = createAction(
  'channelDeposited',
  t.type({ id: t.number, participant: Address, totalDeposit: UInt(32), txHash: Hash }),
  ChannelId,
);
export interface channelDeposited extends ActionType<typeof channelDeposited> {}

/* A channelDeposit request action (with meta: ChannelId) failed with payload=Error */
export const channelDepositFailed = createAction(
  'channelDepositFailed',
  ErrorCodec,
  ChannelId,
  true,
);
export interface channelDepositFailed extends ActionType<typeof channelDepositFailed> {}

/* A withdraw is detected on-chain */
export const channelWithdrawn = createAction(
  'channelWithdrawn',
  t.type({ id: t.number, participant: Address, totalWithdraw: UInt(32), txHash: Hash }),
  ChannelId,
);
export interface channelWithdrawn extends ActionType<typeof channelWithdrawn> {}

/* Request channel meta:ChannelId to be closed */
export const channelClose = createAction(
  'channelClose',
  t.union([t.partial({ subkey: t.boolean }), t.undefined]),
  ChannelId,
);
export interface channelClose extends ActionType<typeof channelClose> {}

/* A close channel event is detected on-chain. Also works as 'success' for channelClose action */
export const channelClosed = createAction(
  'channelClosed',
  t.type({ id: t.number, participant: Address, closeBlock: t.number, txHash: Hash }),
  ChannelId,
);
export interface channelClosed extends ActionType<typeof channelClosed> {}

/* A channelClose request action (with meta: ChannelId) failed with payload=Error */
export const channelCloseFailed = createAction('channelCloseFailed', ErrorCodec, ChannelId, true);
export interface channelCloseFailed extends ActionType<typeof channelCloseFailed> {}

/* A channel meta:ChannelId becomes settleable, starting from payload.settleableBlock */
export const channelSettleable = createAction(
  'channelSettleable',
  t.type({ settleableBlock: t.number }),
  ChannelId,
);
export interface channelSettleable extends ActionType<typeof channelSettleable> {}

/* Request channel meta:ChannelId to be settled */
export const channelSettle = createAction(
  'channelSettle',
  t.union([t.partial({ subkey: t.boolean }), t.undefined]),
  ChannelId,
);
export interface channelSettle extends ActionType<typeof channelSettle> {}

/* A settle channel event is detected on-chain. Also works as 'success' for channelSettle action */
export const channelSettled = createAction(
  'channelSettled',
  t.type({ id: t.number, settleBlock: t.number, txHash: Hash }),
  ChannelId,
);
export interface channelSettled extends ActionType<typeof channelSettled> {}

/* A channelSettle request action (with meta: ChannelId) failed with payload=Error */
export const channelSettleFailed = createAction(
  'channelSettleFailed',
  ErrorCodec,
  ChannelId,
  true,
);
export interface channelSettleFailed extends ActionType<typeof channelSettleFailed> {}
