import { AddressZero, HashZero, Zero } from '@ethersproject/constants';
import * as t from 'io-ts';

import { LocksrootZero, SignatureZero } from '../constants';
import type { Signed } from '../utils/types';
import { Address, Hash, templateLiteral, UInt } from '../utils/types';

// should these become brands?
export type ChannelKey = `0x${string}@0x${string}`;
export const ChannelKey = templateLiteral<ChannelKey>(/^0x[0-9a-fA-F]{40}@0x[0-9a-fA-F]{40}$/);

export type ChannelUniqueKey = `${ChannelKey}#${number}`;
export const ChannelUniqueKey = templateLiteral<ChannelUniqueKey>(
  /^0x[0-9a-fA-F]{40}@0x[0-9a-fA-F]{40}#\d+$/,
);

// Represents a HashTime-Locked amount in a channel
export const Lock = t.intersection(
  [
    t.type({
      amount: UInt(32),
      expiration: UInt(32),
      secrethash: Hash,
    }),
    t.partial({ registered: t.literal(true) }),
  ],
  'Lock',
);
export interface Lock extends t.TypeOf<typeof Lock> {}

/**
 * Balance Proof constructed from an EnvelopeMessage
 * Either produced by us or received from the partner, the BPs are generated from the messages
 * because BP signature requires the hash of the message, for authentication of data not included
 * nor relevant for the smartcontract/BP itself, but so for the peers (e.g. payment_id)
 */
const _BalanceProof = t.readonly(
  t.type({
    // channel data
    chainId: UInt(32),
    tokenNetworkAddress: Address,
    channelId: UInt(32),
    // balance proof data
    nonce: UInt(8),
    transferredAmount: UInt(32),
    lockedAmount: UInt(32),
    locksroot: Hash,
    additionalHash: Hash,
  }),
);
export interface BalanceProof extends t.TypeOf<typeof _BalanceProof> {}
export interface BalanceProofC extends t.Type<BalanceProof, t.OutputOf<typeof _BalanceProof>> {}
export const BalanceProof: BalanceProofC = _BalanceProof;

export const BalanceProofZero: Signed<BalanceProof> = {
  chainId: Zero as UInt<32>,
  tokenNetworkAddress: AddressZero as Address,
  channelId: Zero as UInt<32>,
  nonce: Zero as UInt<8>,
  transferredAmount: Zero as UInt<32>,
  lockedAmount: Zero as UInt<32>,
  locksroot: LocksrootZero,
  additionalHash: HashZero as Hash,
  signature: SignatureZero,
};
