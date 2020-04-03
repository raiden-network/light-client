import * as t from 'io-ts';
import { BigNumber } from 'ethers/utils';

import {
  LockedTransfer,
  Processed,
  SecretReveal,
  Unlock,
  LockExpired,
  RefundTransfer,
  Metadata,
  SecretRequest,
} from '../messages/types';
import { Address, Timed, Hash, Int, Signed, Secret } from '../utils/types';

export enum Direction {
  SENT = 'sent',
  RECEIVED = 'received',
}

/**
 * This struct holds the relevant messages exchanged in a transfer
 * The transfer state is defined by the exchanged messages
 */
export const TransferState = t.readonly(
  t.intersection([
    t.type({
      /** -> outgoing locked transfer */
      transfer: Timed(Signed(LockedTransfer)),
      fee: Int(32),
      partner: Address,
    }),
    t.partial({
      /**
       * Transfer secret, if known
       * registerBlock is 0 if not yet registered on-chain
       * */
      secret: Timed(t.type({ value: Secret, registerBlock: t.number })),
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
       * <- incoming secret request from target
       * If this is set, it means the target requested the secret, not necessarily with a valid
       * amount (an invalid amount < value == lock - fee, means transfer failed)
       */
      secretRequest: Timed(Signed(SecretRequest)),
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
export type TransferState = t.TypeOf<typeof TransferState>;

/**
 * Mapping of outgoing transfers, indexed by the secrethash
 */
export const TransfersState = t.readonly(t.record(t.string /* secrethash: Hash */, TransferState));
export type TransfersState = t.TypeOf<typeof TransfersState>;

export enum RaidenTransferStatus {
  pending = 'PENDING', // transfer was just sent
  received = 'RECEIVED', // transfer acknowledged by partner
  refunded = 'REFUNDED', // partner informed that can't forward transfer
  closed = 'CLOSED', // channel closed before revealing
  requested = 'REQUESTED', // secret requested by target
  revealed = 'REVEALED', // secret revealed to target
  registered = 'REGISTERED', // secret registered on-chain before lock's expiration
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
export interface RaidenTransfer {
  secrethash: Hash; // used as transfer identifier
  direction: 'sent' | 'received';
  status: RaidenTransferStatus;
  initiator: Address; // us
  partner: Address; // receiver/partner/hub
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
