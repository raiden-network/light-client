/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { Address, Hash, UInt } from '../utils/types';
import { Lock } from './types';

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
export const channelOpen = createAsyncAction(
  ChannelId,
  'channel/open/request',
  'channel/open/success',
  'channel/open/failed',
  t.partial({ settleTimeout: t.number, subkey: t.boolean, deposit: UInt(32) }),
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
export const channelMonitor = createAction(
  'channel/monitor',
  t.intersection([t.type({ id: t.number }), t.partial({ fromBlock: t.number })]),
  ChannelId,
);
export interface channelMonitor extends ActionType<typeof channelMonitor> {}

export const channelDeposit = createAsyncAction(
  ChannelId,
  'channel/deposit/request',
  'channel/deposit/success',
  'channel/deposit/failure',
  t.intersection([t.type({ deposit: UInt(32) }), t.partial({ subkey: t.boolean })]),
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
  'channel/close/request',
  'channel/close/success',
  'channel/close/failure',
  t.union([t.partial({ subkey: t.boolean }), t.undefined]),
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

export const channelSettle = createAsyncAction(
  ChannelId,
  'channel/settle/request',
  'channel/settle/success',
  'channel/settle/failure',
  t.union([t.partial({ subkey: t.boolean }), t.undefined]),
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
