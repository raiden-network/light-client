import { AnyAction } from 'redux';

export const enum RaidenActionType {
  NEW_BLOCK = 'newBlock',
  CHANNEL_OPEN = 'channelOpen',
  CHANNEL_OPENED = 'channelOpened',
  CHANNEL_OPEN_FAILED = 'channelOpenFailed',
  TOKEN_MONITOR = 'tokenMonitor',
  TOKEN_MONITORED = 'tokenMonitored',
  TOKEN_MONITOR_FAILED = 'tokenMonitorFailed',
}

export interface RaidenAction extends AnyAction {
  type: RaidenActionType;
}

export interface RaidenActionFailed extends RaidenAction {
  error: Error;
}

export interface NewBlockAction extends RaidenAction {
  type: RaidenActionType.NEW_BLOCK;
  blockNumber: number;
}

export interface ChannelOpenAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_OPEN;
  tokenNetwork: string;
  partner: string;
  deposit: number;
  settleTimeout: number;
}

export interface ChannelOpenedAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_OPENED;
  tokenNetwork: string;
  partner: string;
  id: number;
  settleTimeout: number;
  openBlock: number;
  txHash: string;
}

export interface ChannelOpenActionFailed extends RaidenActionFailed {
  type: RaidenActionType.CHANNEL_OPEN_FAILED;
  tokenNetwork: string;
  partner: string;
}

export interface TokenMonitorAction extends RaidenAction {
  type: RaidenActionType.TOKEN_MONITOR;
  token: string;
}

export interface TokenMonitoredAction extends RaidenAction {
  type: RaidenActionType.TOKEN_MONITORED;
  token: string;
  tokenNetwork: string;
  first: boolean;  // first time monitoring this token, i.e. just started monitoring
}

export interface TokenMonitorActionFailed extends RaidenActionFailed {
  type: RaidenActionType.TOKEN_MONITOR_FAILED;
  token: string;
}

export const newBlock = (blockNumber: number): NewBlockAction =>
  ({ type: RaidenActionType.NEW_BLOCK, blockNumber });

export const channelOpen = (
  tokenNetwork: string,
  partner: string,
  deposit: number,
  settleTimeout: number,
): ChannelOpenAction =>
  ({ type: RaidenActionType.CHANNEL_OPEN, tokenNetwork, partner, deposit, settleTimeout });

export const channelOpened = (
  tokenNetwork: string,
  partner: string,
  id: number,
  settleTimeout: number,
  openBlock: number,
  txHash: string,
): ChannelOpenedAction =>
  ({
    type: RaidenActionType.CHANNEL_OPENED,
    tokenNetwork,
    partner,
    id,
    settleTimeout,
    openBlock,
    txHash,
  });

export const channelOpenFailed = (
  tokenNetwork: string,
  partner: string,
  error: Error,
): ChannelOpenActionFailed =>
  ({ type: RaidenActionType.CHANNEL_OPEN_FAILED, tokenNetwork, partner, error });

export const tokenMonitor = (token: string): TokenMonitorAction =>
  ({ type: RaidenActionType.TOKEN_MONITOR, token });

export const tokenMonitored = (
  token: string,
  tokenNetwork: string,
  first: boolean = false,
): TokenMonitoredAction =>
  ({ type: RaidenActionType.TOKEN_MONITORED, token, tokenNetwork, first });

export const tokenMonitorFailed = (token: string, error: Error): TokenMonitorActionFailed =>
  ({ type: RaidenActionType.TOKEN_MONITOR_FAILED, token, error });

export type RaidenActions =
  NewBlockAction |
  ChannelOpenAction |
  ChannelOpenedAction |
  ChannelOpenActionFailed |
  TokenMonitorAction |
  TokenMonitoredAction |
  TokenMonitorActionFailed ;
