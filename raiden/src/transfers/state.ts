import * as t from 'io-ts';

import { LockedTransfer, LockExpired, Processed, RevealSecret, Unlock } from '../messages/types';

export const SentTransfer = t.intersection([
  t.type({
    transfer: LockedTransfer, // -> outgoing locked transfer
  }),
  t.partial({
    transferProcessed: Processed, // <- incoming processed for locked transfer
    revealSecret: RevealSecret, // <- incoming secret reveal
    unlock: Unlock, // -> outgoing unlock
    lockExpired: LockExpired, // -> outgoing lock expired (if so)
    // processed for Unlock or LockExpired clear this transfer, so aren't here
    // transferFailed also clear this transfer
  }),
]);
export type SentTransfer = t.TypeOf<typeof SentTransfer>;

export const SentTransfers = t.record(t.string /* paymentId.toString() */, SentTransfer);
export type SentTransfers = t.TypeOf<typeof SentTransfers>;
