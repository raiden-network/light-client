import * as t from 'io-ts';

import { Address, EnumType, Hash, Signature, UInt } from '../utils/types';
import { SentTransfers } from '../transfers/state';

export enum ChannelState {
  opening = 'opening',
  open = 'open',
  closing = 'closing',
  closed = 'closed',
  settleable = 'settleable',
  settling = 'settling',
  settled = 'settled',
}

export const ChannelStateC = new EnumType<ChannelState>(ChannelState, 'ChannelState');

// Represents a HashTime-Locked amount in a channel
export const Lock = t.type({
  amount: UInt(32),
  expiration: UInt(32),
  secrethash: Hash,
});
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

/**
 * Contains info of each side of a channel
 */
export const ChannelEnd = t.intersection([
  t.type({
    deposit: UInt(32), // total deposit/contract balance
  }),
  t.partial({
    locks: t.array(Lock),
    balanceProof: SignedBalanceProof,
  }),
]);
export type ChannelEnd = t.TypeOf<typeof ChannelEnd>;

export const Channel = t.intersection([
  t.type({
    own: ChannelEnd,
    partner: ChannelEnd,
  }),
  t.union([
    /* union of types with literals intersection allows narrowing other props presence. e.g.:
     * if (channel.state === ChannelState.open) {
     *   id = channel.id; // <- id can't be undefined
     *   closeBlock = channel.closeBlock; // error: closeBlock only exist on states closed|settling
     * }
     */
    t.type({ state: t.literal(ChannelState.opening) }),
    t.type({
      state: t.union([t.literal(ChannelState.open), t.literal(ChannelState.closing)]),
      id: t.number,
      settleTimeout: t.number,
      openBlock: t.number,
    }),
    t.type({
      state: t.union([
        t.literal(ChannelState.closed),
        t.literal(ChannelState.settleable),
        t.literal(ChannelState.settling),
      ]),
      id: t.number,
      settleTimeout: t.number,
      openBlock: t.number,
      closeBlock: t.number,
    }),
  ]),
  t.partial({
    sent: SentTransfers,
  }),
]);
export type Channel = t.TypeOf<typeof Channel>;

/**
 * Channels is a mapping from tokenNetwork -> partner -> Channel
 * As in: { [tokenNetwork: Address]: { [partner: Address]: Channel } }
 * It's used as codec and type for 'channels' key in RaidenState
 * We use t.string instead of the Address branded codecs because specialized types can't be used
 * as index mapping keys.
 */
export const Channels = t.record(
  t.string /* tokenNetwork: Address */,
  t.record(t.string /* partner: Address */, Channel),
);
export type Channels = t.TypeOf<typeof Channels>;
