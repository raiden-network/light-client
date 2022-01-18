/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { WithdrawConfirmation, WithdrawRequest } from '../messages';
import type { ActionType } from '../utils/actions';
import { createAction, createAsyncAction } from '../utils/actions';
import { Address, Hash, Signed, UInt } from '../utils/types';
import { Lock } from './types';

// interfaces need to be exported, and we need/want to support `import * as RaidenActions`
const ChannelId = t.type({
  tokenNetwork: Address,
  partner: Address,
});

/* A new head in the blockchain is detected by provider */
export const newBlock = createAction('block/new', t.type({ blockNumber: t.number }));
export interface newBlock extends ActionType<typeof newBlock> {}

/* A new blockTime (average time between latest X blocks) was detected */
export const blockTime = createAction('block/time', t.type({ blockTime: t.number }));
export interface blockTime extends ActionType<typeof blockTime> {}

export const blockStale = createAction('block/stale', t.type({ stale: t.boolean }));
export interface blockStale extends ActionType<typeof blockStale> {}

export const contractSettleTimeout = createAction('contract/settleTimeout', t.number);
export interface contractSettleTimeout extends ActionType<typeof contractSettleTimeout> {}

/**
 * A new token network is detected in the TokenNetworkRegistry instance
 * fromBlock is only set on the first time, to fetch and handle past events
 */
export const tokenMonitored = createAction(
  'token/monitored',
  t.intersection([
    t.type({
      token: Address,
      tokenNetwork: Address,
    }),
    t.partial({
      fromBlock: t.number,
      toBlock: t.number,
    }),
  ]),
);
export interface tokenMonitored extends ActionType<typeof tokenMonitored> {}

/**
 * Channel actions receive ChannelId as 'meta' action property
 * This way, 'meta' can be used equally for request, success and error actions
 */
export const channelOpen = createAsyncAction(
  ChannelId,
  'channel/open',
  t.partial({ settleTimeout: t.number, deposit: UInt(32) }),
  t.type({
    id: t.number,
    token: Address,
    settleTimeout: t.number,
    isFirstParticipant: t.boolean,
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);
export namespace channelOpen {
  export interface request extends ActionType<typeof channelOpen.request> {}
  export interface success extends ActionType<typeof channelOpen.success> {}
  export interface failure extends ActionType<typeof channelOpen.failure> {}
}

/* Channel with meta:ChannelId + payload.id should be monitored */
export const channelMonitored = createAction(
  'channel/monitored',
  t.type({ id: t.number }),
  ChannelId,
);
export interface channelMonitored extends ActionType<typeof channelMonitored> {}

export const channelDeposit = createAsyncAction(
  ChannelId,
  'channel/deposit',
  t.intersection([
    t.union([t.type({ deposit: UInt(32) }), t.type({ totalDeposit: UInt(32) })]),
    t.partial({ waitOpen: t.literal(true) }),
  ]),
  t.type({
    id: t.number,
    participant: Address,
    totalDeposit: UInt(32),
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);

export namespace channelDeposit {
  export interface request extends ActionType<typeof channelDeposit.request> {}
  export interface success extends ActionType<typeof channelDeposit.success> {}
  export interface failure extends ActionType<typeof channelDeposit.failure> {}
}

/* A withdraw is detected on-chain */
export const channelWithdrawn = createAction(
  'channel/withdraw/success',
  t.type({
    id: t.number,
    participant: Address,
    totalWithdraw: UInt(32),
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
  ChannelId,
);
export interface channelWithdrawn extends ActionType<typeof channelWithdrawn> {}

export const channelClose = createAsyncAction(
  ChannelId,
  'channel/close',
  t.undefined,
  t.type({
    id: t.number,
    participant: Address,
    txHash: Hash,
    txBlock: t.number,
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);

export namespace channelClose {
  export interface request extends ActionType<typeof channelClose.request> {}
  export interface success extends ActionType<typeof channelClose.success> {}
  export interface failure extends ActionType<typeof channelClose.failure> {}
}

/* A channel meta:ChannelId becomes settleable, starting from payload.settleableBlock */
export const channelSettleable = createAction(
  'channel/settleable',
  t.type({ settleableBlock: t.number }),
  ChannelId,
);
export interface channelSettleable extends ActionType<typeof channelSettleable> {}

const WithdrawPair = t.tuple([Signed(WithdrawRequest), Signed(WithdrawConfirmation)]);

export const channelSettle = createAsyncAction(
  ChannelId,
  'channel/settle',
  t.union([t.type({ coopSettle: t.tuple([WithdrawPair, WithdrawPair]) }), t.undefined]),
  t.intersection([
    t.type({
      id: t.number,
      txHash: Hash,
      txBlock: t.number,
      confirmed: t.union([t.undefined, t.boolean]),
    }),
    t.partial({ locks: t.readonlyArray(Lock) }),
  ]),
);
export namespace channelSettle {
  export interface request extends ActionType<typeof channelSettle.request> {}
  export interface success extends ActionType<typeof channelSettle.success> {}
  export interface failure extends ActionType<typeof channelSettle.failure> {}
}
