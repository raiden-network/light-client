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
export const SentTransfer = t.intersection([
  t.type({
    transfer: Signed(LockedTransfer), // -> outgoing locked transfer
  }),
  t.partial({
    transferProcessed: Signed(Processed), // <- incoming processed for locked transfer
    secretReveal: Signed(SecretReveal), // <- incoming secret reveal from recipient
    unlock: Signed(Unlock), // -> outgoing unlock to recipient
    lockExpired: Signed(LockExpired), // -> outgoing lock expired (if so)
    // processed for Unlock or LockExpired clear this transfer, so aren't persisted
    // transferFailed also clear this transfer
  }),
]);
export type SentTransfer = t.TypeOf<typeof SentTransfer>;

/**
 * Mapping of outgoing transfers, indexed by the secrethash
 */
export const SentTransfers = t.record(t.string /* secrethash: Hash */, SentTransfer);
export type SentTransfers = t.TypeOf<typeof SentTransfers>;
