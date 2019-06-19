import { BigNumber } from 'ethers/utils';
import { createStandardAction } from 'typesafe-actions';

import { ShutdownReason } from '../constants';
import { RaidenMatrixSetup } from './state';

// interfaces need to be exported, and we need/want to support `import * as RaidenActions`
// eslint-disable-next-line @typescript-eslint/prefer-interface
type ChannelId = {
  tokenNetwork: string;
  partner: string;
};

// actions-creators
// ========

export const raidenInit = createStandardAction('raidenInit')<undefined>();

export const raidenShutdown = createStandardAction('raidenShutdown')<{
  reason: ShutdownReason | Error;
}>();

export const newBlock = createStandardAction('newBlock')<{ blockNumber: number }>();

export const tokenMonitored = createStandardAction('tokenMonitored').map(
  ({
    token,
    tokenNetwork,
    first = false,
  }: {
    token: string;
    tokenNetwork: string;
    first?: boolean;
  }) => ({
    payload: { token, tokenNetwork, first },
  }),
);

/**
 * Channel actions receive ChannelId as 'meta' action property
 * This way, 'meta' can be used equally for request, success and error actions
 */

/* Request a channel to be opened with meta={ tokenNetwork, partner } and payload.settleTimeout */
export const channelOpen = createStandardAction('channelOpen')<
  { settleTimeout: number },
  ChannelId
>();

/* A channel is detected on-chain. Also works as 'success' for channelOpen action */
export const channelOpened = createStandardAction('channelOpened')<
  { id: number; settleTimeout: number; openBlock: number; txHash: string },
  ChannelId
>();

/* A channelOpen request action (with meta: ChannelId) failed with payload=Error */
export const channelOpenFailed = createStandardAction('channelOpenFailed').map(
  (payload: Error, meta: ChannelId) => ({ payload, error: true, meta }),
);

/* Channel with meta:ChannelId + payload.id should be monitored */
export const channelMonitored = createStandardAction('channelMonitored')<
  { id: number; fromBlock?: number },
  ChannelId
>();

/* Request a payload.deposit to be made to channel meta:ChannelId */
export const channelDeposit = createStandardAction('channelDeposit')<
  { deposit: BigNumber },
  ChannelId
>();

/* A deposit is detected on-chain. Also works as 'success' for channelDeposit action */
export const channelDeposited = createStandardAction('channelDeposited')<
  { id: number; participant: string; totalDeposit: BigNumber; txHash: string },
  ChannelId
>();

/* A channelDeposit request action (with meta: ChannelId) failed with payload=Error */
export const channelDepositFailed = createStandardAction('channelDepositFailed').map(
  (payload: Error, meta: ChannelId) => ({ payload, error: true, meta }),
);

/* Request channel meta:ChannelId to be closed */
export const channelClose = createStandardAction('channelClose')<undefined, ChannelId>();

/* A close channel event is detected on-chain. Also works as 'success' for channelClose action */
export const channelClosed = createStandardAction('channelClosed')<
  { id: number; participant: string; closeBlock: number; txHash: string },
  ChannelId
>();

/* A channelClose request action (with meta: ChannelId) failed with payload=Error */
export const channelCloseFailed = createStandardAction('channelCloseFailed').map(
  (payload: Error, meta: ChannelId) => ({ payload, error: true, meta }),
);

/* A channel meta:ChannelId becomes settleable, starting from payload.settleableBlock */
export const channelSettleable = createStandardAction('channelSettleable')<
  { settleableBlock: number },
  ChannelId
>();

/* Request channel meta:ChannelId to be settled */
export const channelSettle = createStandardAction('channelSettle')<undefined, ChannelId>();

/* A settle channel event is detected on-chain. Also works as 'success' for channelSettle action */
export const channelSettled = createStandardAction('channelSettled')<
  { id: number; settleBlock: number; txHash: string },
  ChannelId
>();

/* A channelSettle request action (with meta: ChannelId) failed with payload=Error */
export const channelSettleFailed = createStandardAction('channelSettleFailed').map(
  (payload: Error, meta: ChannelId) => ({ payload, error: true, meta }),
);

/* MatrixClient instance is ready and logged in to payload.server with credentials payload.setup */
export const matrixSetup = createStandardAction('matrixSetup')<{
  server: string;
  setup: RaidenMatrixSetup;
}>();

/* Request matrix to start monitoring presence updates for meta.address */
export const matrixRequestMonitorPresence = createStandardAction('matrixRequestMonitorPresence')<
  undefined,
  { address: string }
>();

// TODO: declare all { address: string } as { address: Address }
/**
 * Monitored user meta.address presence updated.
 * First event for this address also works as 'success' for matrixRequestMonitorPresence
 */
export const matrixPresenceUpdate = createStandardAction('matrixPresenceUpdate').map(
  (
    { userId, available, ts }: { userId: string; available: boolean; ts?: number },
    meta: { address: string },
  ) => ({ payload: { userId, available, ts: ts || Date.now() }, meta }),
);

/* A matrixRequestMonitorPresence request action (with meta.address) failed with payload=Error */
export const matrixRequestMonitorPresenceFailed = createStandardAction(
  'matrixRequestMonitorPresenceFailed',
).map((payload: Error, meta: { address: string }) => ({ payload, error: true, meta }));

/* payload.roomId must go front on meta.address's room queue */
export const matrixRoom = createStandardAction('matrixRoom')<
  { roomId: string },
  { address: string }
>();

/* payload.roomId must be excluded from meta.address room queue, if present */
export const matrixRoomLeave = createStandardAction('matrixRoomLeave')<
  { roomId: string },
  { address: string }
>();

/* One-shot send payload.message to meta.address user in transport */
export const messageSend = createStandardAction('messageSend')<
  { message: string },
  { address: string }
>();

/**
 * payload.message was received on payload.ts (timestamp) from meta.address
 * payload.userId and payload.roomId are optional and specific to matrix transport, as sender info
 */
export const messageReceived = createStandardAction('messageReceived').map(
  (
    {
      message,
      ts,
      userId,
      roomId,
    }: {
      message: string;
      ts?: number;
      userId?: string;
      roomId?: string;
    },
    meta: { address: string },
  ) => ({ payload: { message, ts: ts || Date.now(), userId, roomId }, meta }),
);
