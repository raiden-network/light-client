import * as t from 'io-ts';

import { Address, BigNumberC, Hash, PositiveInt, Signature } from '../utils/types';
import { ChannelStateC, Lock } from './types';

/**
 * Balance Proof constructed from an EnvelopeMessage
 * Either produced by us or received from the partner, the BPs are generated from the messages
 * because BP signature requires the hash of the message, for authentication of data not included
 * nor relevant for the smartcontract/BP itself, but so for the peers (e.g. payment_id)
 */
export const SignedBalanceProof = t.type({
  // channel data
  chainId: PositiveInt,
  tokenNetworkAddress: Address,
  channelId: PositiveInt,
  // balance proof data
  nonce: PositiveInt,
  transferredAmount: BigNumberC,
  lockedAmount: BigNumberC,
  locksroot: Hash,
  messageHash: Hash,
  signature: Signature,
  sender: Address, // TODO: check if sender can be replaced by getter/recover function
});
export type SignedBalanceProof = t.TypeOf<typeof SignedBalanceProof>;

/**
 * Contains info of each side of a channel
 */
export const ChannelEnd = t.intersection([
  t.type({
    deposit: BigNumberC, // total deposit/contract balance
  }),
  t.partial({
    locks: t.array(Lock),
    balanceProof: SignedBalanceProof,
  }),
]);
export type ChannelEnd = t.TypeOf<typeof ChannelEnd>;

export const Channel = t.intersection([
  t.type({
    state: ChannelStateC,
    own: ChannelEnd,
    partner: ChannelEnd,
  }),
  t.partial({
    id: t.number,
    settleTimeout: t.number,
    openBlock: t.number,
    closeBlock: t.number,
  }),
]);
export type Channel = t.TypeOf<typeof Channel>;

/**
 * Channels is a mapping from tokenNetwork -> partner -> Channel
 * As in: { [tokenNetwork: Address]: { [partner: Address]: Channel } }
 * It's used as codec and type for 'channels' key in RaidenState
 */
export const Channels = t.record(Address, t.record(Address, Channel));
export type Channels = t.TypeOf<typeof Channels>;
