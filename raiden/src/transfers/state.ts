import * as t from 'io-ts';

import {
  Signed,
  LockedTransfer,
  Processed,
  SecretReveal,
  Unlock,
  LockExpired,
  RefundTransfer,
} from '../messages/types';
import { Timed, Hash } from '../utils/types';

/**
 * This struct holds the relevant messages exchanged in a transfer
 * The transfer state is defined by the exchanged messages
 */
export const SentTransfer = t.readonly(
  t.intersection([
    t.type({
      /** -> outgoing locked transfer */
      transfer: Timed(Signed(LockedTransfer)),
    }),
    t.partial({
      /** <- incoming processed for locked transfer */
      transferProcessed: Timed(Signed(Processed)),
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
       * <- incoming processed for Unlock message
       * If this is set, the protocol completed by the transfer succeeding and partner
       * acknowledging validity of our off-chain unlock
       */
      unlockProcessed: Timed(Signed(Processed)),
      /**
       * -> outgoing lock expired (if so)
       * If this is set, transfer failed, and we expired the lock (retrieving the locked amount).
       * Transfer failed may not have completed yet, e.g. waiting for LockExpired's Processed reply
       */
      lockExpired: Timed(Signed(LockExpired)),
      /**
       * <- incoming processed for LockExpired message
       * If this is set, the protocol completed by the transfer failing and partner acknowledging
       * this transfer can't be claimed anymore
       */
      lockExpiredProcessed: Timed(Signed(Processed)),
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
    }),
  ]),
);
export type SentTransfer = t.TypeOf<typeof SentTransfer>;

/**
 * Mapping of outgoing transfers, indexed by the secrethash
 */
export const SentTransfers = t.readonly(t.record(t.string /* secrethash: Hash */, SentTransfer));
export type SentTransfers = t.TypeOf<typeof SentTransfers>;
