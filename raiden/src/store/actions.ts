import { AnyAction } from 'redux';
import { BigNumber } from 'ethers/utils';
import { RaidenMatrix } from './state';

export enum RaidenActionType {
  INIT = 'raidenInit',
  SHUTDOWN = 'raidenShutdown',
  NEW_BLOCK = 'newBlock',
  TOKEN_MONITORED = 'tokenMonitored',
  CHANNEL_OPEN = 'channelOpen',
  CHANNEL_OPENED = 'channelOpened',
  CHANNEL_OPEN_FAILED = 'channelOpenFailed',
  CHANNEL_MONITORED = 'channelMonitored',
  CHANNEL_DEPOSIT = 'channelDeposit',
  CHANNEL_DEPOSITED = 'channelDeposited',
  CHANNEL_DEPOSIT_FAILED = 'channelDepositFailed',
  CHANNEL_CLOSE = 'channelClose',
  CHANNEL_CLOSED = 'channelClosed',
  CHANNEL_CLOSE_FAILED = 'channelCloseFailed',
  CHANNEL_SETTLEABLE = 'channelSettleable',
  CHANNEL_SETTLE = 'channelSettle',
  CHANNEL_SETTLED = 'channelSettled',
  CHANNEL_SETTLE_FAILED = 'channelSettleFailed',
  MATRIX_SETUP = 'matrixSetup',
}

export enum ShutdownReason {
  STOP = 'raidenStopped',
  ACCOUNT_CHANGED = 'providerAccountChanged',
  NETWORK_CHANGED = 'providerNetworkChanged',
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

export interface RaidenShutdownAction extends RaidenAction {
  type: RaidenActionType.SHUTDOWN;
  reason: ShutdownReason | Error;
}

export interface NewBlockAction extends RaidenAction {
  type: RaidenActionType.NEW_BLOCK;
  blockNumber: number;
}

export interface TokenMonitoredAction extends RaidenAction {
  type: RaidenActionType.TOKEN_MONITORED;
  token: string;
  tokenNetwork: string;
  first: boolean; // first time monitoring this token, i.e. just started monitoring
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

export interface ChannelMonitoredAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_MONITORED;
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

export interface ChannelCloseAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_CLOSE;
  tokenNetwork: string;
  partner: string;
}

export interface ChannelClosedAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_CLOSED;
  tokenNetwork: string;
  partner: string;
  id: number;
  participant: string;
  closeBlock: number;
  txHash: string;
}

export interface ChannelCloseActionFailed extends RaidenActionFailed {
  type: RaidenActionType.CHANNEL_CLOSE_FAILED;
  tokenNetwork: string;
  partner: string;
  error: Error;
}

export interface ChannelSettleableAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_SETTLEABLE;
  tokenNetwork: string;
  partner: string;
  settleableBlock: number;
}

export interface ChannelSettleAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_SETTLE;
  tokenNetwork: string;
  partner: string;
}

export interface ChannelSettledAction extends RaidenAction {
  type: RaidenActionType.CHANNEL_SETTLED;
  tokenNetwork: string;
  partner: string;
  id: number;
  settleBlock: number;
  txHash: string;
}

export interface ChannelSettleActionFailed extends RaidenAction {
  type: RaidenActionType.CHANNEL_SETTLE_FAILED;
  tokenNetwork: string;
  partner: string;
  error: Error;
}

export interface MatrixSetupAction extends RaidenAction {
  type: RaidenActionType.MATRIX_SETUP;
  setup: RaidenMatrix;
}

// action factories:
// =================

export const raidenInit = (): RaidenInitAction => ({ type: RaidenActionType.INIT });

export const raidenShutdown = (reason: ShutdownReason | Error): RaidenShutdownAction => ({
  type: RaidenActionType.SHUTDOWN,
  reason,
});

export const newBlock = (blockNumber: number): NewBlockAction => ({
  type: RaidenActionType.NEW_BLOCK,
  blockNumber,
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
): ChannelMonitoredAction => ({
  type: RaidenActionType.CHANNEL_MONITORED,
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

export const channelClose = (tokenNetwork: string, partner: string): ChannelCloseAction => ({
  type: RaidenActionType.CHANNEL_CLOSE,
  tokenNetwork,
  partner,
});

export const channelClosed = (
  tokenNetwork: string,
  partner: string,
  id: number,
  participant: string,
  closeBlock: number,
  txHash: string,
): ChannelClosedAction => ({
  type: RaidenActionType.CHANNEL_CLOSED,
  tokenNetwork,
  partner,
  id,
  participant,
  closeBlock,
  txHash,
});

export const channelCloseFailed = (
  tokenNetwork: string,
  partner: string,
  error: Error,
): ChannelCloseActionFailed => ({
  type: RaidenActionType.CHANNEL_CLOSE_FAILED,
  tokenNetwork,
  partner,
  error,
});

export const channelSettleable = (
  tokenNetwork: string,
  partner: string,
  settleableBlock: number,
): ChannelSettleableAction => ({
  type: RaidenActionType.CHANNEL_SETTLEABLE,
  tokenNetwork,
  partner,
  settleableBlock,
});

export const channelSettle = (tokenNetwork: string, partner: string): ChannelSettleAction => ({
  type: RaidenActionType.CHANNEL_SETTLE,
  tokenNetwork,
  partner,
});

export const channelSettled = (
  tokenNetwork: string,
  partner: string,
  id: number,
  settleBlock: number,
  txHash: string,
): ChannelSettledAction => ({
  type: RaidenActionType.CHANNEL_SETTLED,
  tokenNetwork,
  partner,
  id,
  settleBlock,
  txHash,
});

export const channelSettleFailed = (
  tokenNetwork: string,
  partner: string,
  error: Error,
): ChannelSettleActionFailed => ({
  type: RaidenActionType.CHANNEL_SETTLE_FAILED,
  tokenNetwork,
  partner,
  error,
});

export const matrixSetup = (setup: RaidenMatrix): MatrixSetupAction => ({
  type: RaidenActionType.MATRIX_SETUP,
  setup,
});

export type RaidenActions =
  | RaidenInitAction
  | RaidenShutdownAction
  | NewBlockAction
  | TokenMonitoredAction
  | ChannelOpenAction
  | ChannelOpenedAction
  | ChannelOpenActionFailed
  | ChannelMonitoredAction
  | ChannelDepositAction
  | ChannelDepositedAction
  | ChannelDepositActionFailed
  | ChannelCloseAction
  | ChannelClosedAction
  | ChannelCloseActionFailed
  | ChannelSettleableAction
  | ChannelSettleAction
  | ChannelSettledAction
  | ChannelSettleActionFailed
  | MatrixSetupAction;

export const RaidenEventType: (RaidenActionType.SHUTDOWN | RaidenActionType.NEW_BLOCK)[] = [
  RaidenActionType.SHUTDOWN,
  RaidenActionType.NEW_BLOCK,
];

export type RaidenEvents = RaidenShutdownAction | NewBlockAction;
