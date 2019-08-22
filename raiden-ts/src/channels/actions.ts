import { BigNumber } from 'ethers/utils';
import { createStandardAction } from 'typesafe-actions';

import { Address, Hash } from '../utils/types';

// interfaces need to be exported, and we need/want to support `import * as RaidenActions`
// eslint-disable-next-line @typescript-eslint/prefer-interface
type ChannelId = {
  tokenNetwork: Address;
  partner: Address;
};

/* A new head in the blockchain is detected by provider */
export const newBlock = createStandardAction('newBlock')<{ blockNumber: number }>();

/* A new token network is detected in the TokenNetworkRegistry instance */
export const tokenMonitored = createStandardAction('tokenMonitored').map(
  ({
    token,
    tokenNetwork,
    first = false,
  }: {
    token: Address;
    tokenNetwork: Address;
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
  { id: number; settleTimeout: number; openBlock: number; txHash: Hash },
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
  { id: number; participant: Address; totalDeposit: BigNumber; txHash: Hash },
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
  { id: number; participant: Address; closeBlock: number; txHash: Hash },
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
  { id: number; settleBlock: number; txHash: Hash },
  ChannelId
>();

/* A channelSettle request action (with meta: ChannelId) failed with payload=Error */
export const channelSettleFailed = createStandardAction('channelSettleFailed').map(
  (payload: Error, meta: ChannelId) => ({ payload, error: true, meta }),
);
