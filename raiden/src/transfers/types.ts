import { BigNumber } from 'ethers/utils';
import { Address, Hash } from '../utils/types';

export enum RaidenSentTransferStatus {
  pending = 'PENDING', // transfer was just sent
  received = 'RECEIVED', // transfer acknowledged by partner
  revealed = 'REVEALED', // secret asked and revealed to target
  unlocked = 'UNLOCKED', // unlock sent to partner
  refunded = 'REFUNDED', // partner informed that can't forward transfer
  expired = 'EXPIRED', // lock expired sent to partner
  succeeded = 'SUCCEEDED', // unlock acknowledged by partner (complete with success)
  failed = 'FAILED', // lock expired acknowledged by partner (complete with failure)
}

export interface RaidenSentTransfer {
  secrethash: Hash; // used as transfer identifier
  status: RaidenSentTransferStatus;
  initiator: Address; // us
  recipient: Address; // receiver/partner/hub
  target: Address; // final receiver of the transfer
  paymentId: BigNumber;
  chainId: number;
  token: Address; // token address
  tokenNetwork: Address; // token network address
  channelId: BigNumber; // channel identifier in which the transfer went through
  amount: BigNumber; // amount to transfer
  fee: BigNumber; // not supported yet, so always Zero
  startedAt: Date; // time of transfer start
  changedAt: Date; // time of current/last state (if transfer completed, end timestamp)
  success: boolean | undefined; // undefined=pending, true=success, false=failed
}
