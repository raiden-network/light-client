import * as t from 'io-ts';

import { Address, Hash, Signature, UInt } from '../utils/types';

// Represents a HashTime-Locked amount in a channel
export const Lock = t.type(
  {
    amount: UInt(32),
    expiration: UInt(32),
    secrethash: Hash,
  },
  'Lock',
);
export type Lock = t.TypeOf<typeof Lock>;

/**
 * Balance Proof constructed from an EnvelopeMessage
 * Either produced by us or received from the partner, the BPs are generated from the messages
 * because BP signature requires the hash of the message, for authentication of data not included
 * nor relevant for the smartcontract/BP itself, but so for the peers (e.g. payment_id)
 */
export const SignedBalanceProof = t.type({
  // channel data
  chainId: UInt(32),
  tokenNetworkAddress: Address,
  channelId: UInt(32),
  // balance proof data
  nonce: UInt(8),
  transferredAmount: UInt(32),
  lockedAmount: UInt(32),
  locksroot: Hash,
  messageHash: Hash,
  signature: Signature,
  sender: Address,
});
export type SignedBalanceProof = t.TypeOf<typeof SignedBalanceProof>;
