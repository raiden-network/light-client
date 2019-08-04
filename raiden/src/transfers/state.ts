import * as t from 'io-ts';

import {
  Signed,
  LockedTransfer,
  Processed,
  SecretReveal,
  Unlock,
  LockExpired,
} from '../messages/types';

/**
 * This struct holds the relevant messages exchanged in a transfer
 * The transfer state is defined by the exchanged messages
 */
export const SentTransfer = t.readonly(
  t.intersection([
    t.type({
      /** -> outgoing locked transfer */
      transfer: Signed(LockedTransfer),
    }),
    t.partial({
      /** <- incoming processed for locked transfer */
      transferProcessed: Signed(Processed),
      /**
       * -> outgoing secret reveal to target
       * If this is set, it means the secret was revealed (so transfer succeeded, even if it didn't
       * complete yet)
       */
      secretReveal: Signed(SecretReveal),
      /**
       * -> outgoing unlock to recipient
       * If this is set, it means the Unlock was sent (even if partner didn't acknowledge it yet)
       */
      unlock: Signed(Unlock),
      /**
       * -> outgoing lock expired (if so)
       * If this is set, transfer failed, and we expired the lock (retrieving the locked amount).
       * Transfer failed may not have completed yet, e.g. waiting for LockExpired's Processed reply
       */
      lockExpired: Signed(LockExpired),
      // Processed for Unlock or LockExpired clear this transfer, so aren't persisted here
      // TODO: check on how to handle RefundTransfer
    }),
  ]),
);
export type SentTransfer = t.TypeOf<typeof SentTransfer>;

/**
 * Mapping of outgoing transfers, indexed by the secrethash
 */
export const SentTransfers = t.readonly(t.record(t.string /* secrethash: Hash */, SentTransfer));
export type SentTransfers = t.TypeOf<typeof SentTransfers>;
