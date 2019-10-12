import * as t from 'io-ts';
import { BigNumber } from 'ethers/utils';

import {
  Signed,
  LockedTransfer,
  Processed,
  SecretReveal,
  Unlock,
  LockExpired,
  RefundTransfer,
  Metadata,
} from '../messages/types';
import { Address, Timed, Hash, Int } from '../utils/types';

/**
 * This struct holds the relevant messages exchanged in a transfer
 * The transfer state is defined by the exchanged messages
 */
export const SentTransfer = t.readonly(
  t.intersection([
    t.type({
      /** -> outgoing locked transfer */
      transfer: Timed(Signed(LockedTransfer)),
      fee: Int(32),
    }),
    t.partial({
      /** <- incoming processed for locked transfer */
      transferProcessed: Timed(Signed(Processed)),
      /**
       * <- incoming refund transfer (if so)
       * If this is set, transfer failed and partner tried refunding the transfer to us. We don't
       * handle receiving transfers, but just store it here to mark this transfer as failed with a
       * refund, until the lock expires normally
       */
      refund: Timed(Signed(RefundTransfer)),
      /**
       * !! channel was closed !!
       * In the case a channel is closed (possibly middle transfer), this will be the txHash of the
       * CloseChannel transaction. No further actions are possible after it's set.
       */
      channelClosed: Timed(Hash),
      /**
       * -> outgoing secret reveal to target
       * If this is set, it means the secret was revealed (so transfer succeeded, even if it didn't
       * complete yet)
       */
      secretReveal: Timed(Signed(SecretReveal)),
      /**
       * -> outgoing unlock to recipient
       * If this is set, it means the Unlock was sent (even if partner didn't acknowledge it yet)
       */
      unlock: Timed(Signed(Unlock)),
      /**
       * -> outgoing lock expired (if so)
       * If this is set, transfer failed, and we expired the lock (retrieving the locked amount).
       * Transfer failed may not have completed yet, e.g. waiting for LockExpired's Processed reply
       */
      lockExpired: Timed(Signed(LockExpired)),
      /**
       * <- incoming processed for Unlock message
       * If this is set, the protocol completed by the transfer succeeding and partner
       * acknowledging validity of our off-chain unlock
       */
      unlockProcessed: Timed(Signed(Processed)),
      /**
       * <- incoming processed for LockExpired message
       * If this is set, the protocol completed by the transfer failing and partner acknowledging
       * this transfer can't be claimed anymore
       */
      lockExpiredProcessed: Timed(Signed(Processed)),
    }),
  ]),
);
export type SentTransfer = t.TypeOf<typeof SentTransfer>;

/**
 * Mapping of outgoing transfers, indexed by the secrethash
 */
export const SentTransfers = t.readonly(t.record(t.string /* secrethash: Hash */, SentTransfer));
export type SentTransfers = t.TypeOf<typeof SentTransfers>;

export enum RaidenSentTransferStatus {
  pending = 'PENDING', // transfer was just sent
  received = 'RECEIVED', // transfer acknowledged by partner
  refunded = 'REFUNDED', // partner informed that can't forward transfer
  closed = 'CLOSED', // channel closed before revealing
  revealed = 'REVEALED', // secret asked and revealed to target
  unlocking = 'UNLOCKING', // unlock sent to partner
  expiring = 'EXPIRING', // lock expired sent to partner
  unlocked = 'UNLOCKED', // unlock acknowledged by partner (complete with success)
  expired = 'EXPIRED', // lock expired acknowledged by partner (complete with failure)
}

/**
 * Public exposed transfers interface (Raiden.transfers$)
 *
 * This should be only used as a public view of the internal transfer state
 */
export interface RaidenSentTransfer {
  secrethash: Hash; // used as transfer identifier
  status: RaidenSentTransferStatus;
  initiator: Address; // us
  recipient: Address; // receiver/partner/hub
  target: Address; // final receiver of the transfer
  metadata: Metadata; // chosen routes
  paymentId: BigNumber;
  chainId: number;
  token: Address; // token address
  tokenNetwork: Address; // token network address
  channelId: BigNumber; // channel identifier in which the transfer went through
  value: BigNumber; // target transfer amount
  fee: BigNumber; // fee paid to mediators
  amount: BigNumber; // total transfer amount, equals value + fee
  expirationBlock: number; // blockNumber in which this transfer expires (if doesn't succeed)
  startedAt: Date; // time of transfer start
  changedAt: Date; // time of current/last state (if transfer completed, end timestamp)
  /**
   * Set as soon as known if transfer did happen or fail (even if still there're pending actions)
   * undefined=pending, true=success, false=failed
   */
  success: boolean | undefined;
  /**
   * True if transfer did complete, i.e. nothing else left to be done for it
   * False if transfer still has pending actions (even if success status is already known)
   */
  completed: boolean;
}
