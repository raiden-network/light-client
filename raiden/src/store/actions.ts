import { AnyAction } from 'redux';
import { BigNumber } from './types';

export const enum RaidenActionType {
  INIT = 'raidenInit',
  NEW_BLOCK = 'newBlock',
  TOKEN_MONITOR = 'tokenMonitor',
  TOKEN_MONITORED = 'tokenMonitored',
  TOKEN_MONITOR_FAILED = 'tokenMonitorFailed',
  CHANNEL_OPEN = 'channelOpen',
  CHANNEL_OPENED = 'channelOpened',
  CHANNEL_OPEN_FAILED = 'channelOpenFailed',
  CHANNEL_MONITOR = 'channelMonitor',
  CHANNEL_DEPOSIT = 'channelDeposit',
  CHANNEL_DEPOSITED = 'channelDeposited',
  CHANNEL_DEPOSIT_FAILED = 'channelDepositFailed',
}

// actions:
// ========

export interface RaidenAction extends AnyAction {
  type: RaidenActionType;
}

export interface RaidenActionFailed extends RaidenAction {
  error: Error;
}

export interface RaidenInitAction extends RaidenAction {
  type: RaidenActionType.INIT;
}

export interface NewBlockAction extends RaidenAction {
  type: RaidenActionType.NEW_BLOCK;
  blockNumber: number;
}

export interface TokenMonitorAction extends RaidenAction {
  type: RaidenActionType.TOKEN_MONITOR;
  token: string;
}

export interface TokenMonitoredAction extends RaidenAction {
  type: RaidenActionType.TOKEN_MONITORED;
  token: string;
  tokenNetwork: string;
  first: boolean; // first time monitoring this token, i.e. just started monitoring
}

export interface TokenMonitorActionFailed extends RaidenActionFailed {
  type: RaidenActionType.TOKEN_MONITOR_FAILED;
  token: string;
}

export interface ChannelOpenAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_OPEN;
  tokenNetwork: string;
  partner: string;
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

export interface ChannelMonitorAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_MONITOR;
  tokenNetwork: string;
  partner: string;
  id: number;
  fromBlock?: number;
}

export interface ChannelDepositAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_DEPOSIT;
  tokenNetwork: string;
  partner: string;
  deposit: BigNumber;
}

export interface ChannelDepositedAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_DEPOSITED;
  tokenNetwork: string;
  partner: string;
  id: number;
  participant: string;
  totalDeposit: BigNumber;
  txHash: string;
}

export interface ChannelDepositActionFailed extends RaidenActionFailed {
  type: RaidenActionType.CHANNEL_DEPOSIT_FAILED;
  tokenNetwork: string;
  partner: string;
  error: Error;
}

// action factories:
// =================

export const raidenInit = (): RaidenInitAction => ({ type: RaidenActionType.INIT });

export const newBlock = (blockNumber: number): NewBlockAction => ({
  type: RaidenActionType.NEW_BLOCK,
  blockNumber,
});

export const tokenMonitor = (token: string): TokenMonitorAction => ({
  type: RaidenActionType.TOKEN_MONITOR,
  token,
});

export const tokenMonitored = (
  token: string,
  tokenNetwork: string,
  first: boolean = false,
): TokenMonitoredAction => ({
  type: RaidenActionType.TOKEN_MONITORED,
  token,
  tokenNetwork,
  first,
});

export const tokenMonitorFailed = (token: string, error: Error): TokenMonitorActionFailed => ({
  type: RaidenActionType.TOKEN_MONITOR_FAILED,
  token,
  error,
});

export const channelOpen = (
  tokenNetwork: string,
  partner: string,
  settleTimeout: number,
): ChannelOpenAction => ({
  type: RaidenActionType.CHANNEL_OPEN,
  tokenNetwork,
  partner,
  settleTimeout,
});

export const channelOpened = (
  tokenNetwork: string,
  partner: string,
  id: number,
  settleTimeout: number,
  openBlock: number,
  txHash: string,
): ChannelOpenedAction => ({
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
): ChannelOpenActionFailed => ({
  type: RaidenActionType.CHANNEL_OPEN_FAILED,
  tokenNetwork,
  partner,
  error,
});

export const channelMonitored = (
  tokenNetwork: string,
  partner: string,
  id: number,
  fromBlock?: number,
): ChannelMonitorAction => ({
  type: RaidenActionType.CHANNEL_MONITOR,
  tokenNetwork,
  partner,
  id,
  fromBlock,
});

export const channelDeposit = (
  tokenNetwork: string,
  partner: string,
  deposit: BigNumber,
): ChannelDepositAction => ({
  type: RaidenActionType.CHANNEL_DEPOSIT,
  tokenNetwork,
  partner,
  deposit,
});

export const channelDeposited = (
  tokenNetwork: string,
  partner: string,
  id: number,
  participant: string,
  totalDeposit: BigNumber,
  txHash: string,
): ChannelDepositedAction => ({
  type: RaidenActionType.CHANNEL_DEPOSITED,
  tokenNetwork,
  partner,
  id,
  participant,
  totalDeposit,
  txHash,
});

export const channelDepositFailed = (
  tokenNetwork: string,
  partner: string,
  error: Error,
): ChannelDepositActionFailed => ({
  type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
  tokenNetwork,
  partner,
  error,
});

export type RaidenActions =
  | RaidenInitAction
  | NewBlockAction
  | TokenMonitorAction
  | TokenMonitoredAction
  | TokenMonitorActionFailed
  | ChannelOpenAction
  | ChannelOpenedAction
  | ChannelOpenActionFailed
  | ChannelMonitorAction
  | ChannelDepositAction
  | ChannelDepositedAction
  | ChannelDepositActionFailed;
