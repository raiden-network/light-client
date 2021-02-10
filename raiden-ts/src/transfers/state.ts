import type { BigNumber } from '@ethersproject/bignumber';
import * as t from 'io-ts';
import invert from 'lodash/invert';

import type { Metadata } from '../messages/types';
import {
  LockedTransfer,
  LockExpired,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
} from '../messages/types';
import { Address, Hash, Int, Secret, Signed, Timed } from '../utils/types';

// it's like an enum, but with literals
export const Direction = {
  SENT: 'sent',
  RECEIVED: 'received',
} as const;
export type Direction = typeof Direction[keyof typeof Direction];
export const DirectionC = t.keyof(invert(Direction) as { [D in Direction]: string });

/**
 * This struct holds the relevant messages exchanged in a transfer
 * The transfer state is defined by the exchanged messages
 */
const _TransferState = t.readonly(
  t.intersection([
    t.type(
      {
        _id: t.string, // transferKey
        channel: t.string, // channelUniqueKey
        direction: DirectionC,
        secrethash: Hash,
        expiration: t.number, // [number] version of [transfer.lock.expiration]
        /** -> outgoing locked transfer */
        transfer: Timed(Signed(LockedTransfer)),
        fee: Int(32),
        partner: Address,
        /* timestamp of when transfer completed and may be cleared from state (non-cleared=0) */
        cleared: t.number,
      },
      'TransferStateBase',
    ),
    t.partial(
      {
        /** Transfer secret, if known */
        secret: Secret,
        /** Set iff secret got registered on-chain on a block before transfer expiration */
        secretRegistered: Timed(t.type({ txHash: Hash, txBlock: t.number })),
        /** <- incoming processed for locked transfer */
        transferProcessed: Timed(Signed(Processed)),
        /** !! channel was closed !!  */
        channelClosed: Timed(t.type({ txHash: Hash, txBlock: t.number })),
        /** channel was settled */
        channelSettled: Timed(t.type({ txHash: Hash, txBlock: t.number })),
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
        expired: Timed(Signed(LockExpired)),
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
        expiredProcessed: Timed(Signed(Processed)),
      },
      'TransferStateOpts',
    ),
  ]),
);
export interface TransferState extends t.TypeOf<typeof _TransferState> {}
export interface TransferStateC extends t.Type<TransferState, t.OutputOf<typeof _TransferState>> {}
export const TransferState: TransferStateC = _TransferState;

export enum RaidenTransferStatus {
  pending = 'PENDING', // transfer was just sent
  received = 'RECEIVED', // transfer acknowledged by partner
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
  key: string; // some key which uniquely identifies this transfer
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
  secret?: Secret;
}
