import * as t from 'io-ts';
import { BigNumber } from 'ethers/utils';

import { EnumType, UInt, Address } from '../utils/types';
import { Lock, SignedBalanceProof } from './types';

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

/**
 * Contains info of each side of a channel
 */
export const ChannelEnd = t.readonly(
  t.intersection([
    t.type({
      deposit: UInt(32), // total deposit/contract balance
    }),
    t.partial({
      locks: t.array(Lock),
      balanceProof: SignedBalanceProof,
    }),
  ]),
);
export interface ChannelEnd extends t.TypeOf<typeof ChannelEnd> {}

export const Channel = t.intersection([
  t.readonly(
    t.type({
      own: ChannelEnd,
      partner: ChannelEnd,
    }),
  ),
  t.union([
    /* union of types with literals intersection allows narrowing other props presence. e.g.:
     * if (channel.state === ChannelState.open) {
     *   id = channel.id; // <- id can't be undefined
     *   closeBlock = channel.closeBlock; // error: closeBlock only exist on states closed|settling
     * }
     */
    t.readonly(t.type({ state: t.literal(ChannelState.opening) })),
    t.readonly(
      t.type({
        state: t.union([t.literal(ChannelState.open), t.literal(ChannelState.closing)]),
        id: t.number,
        settleTimeout: t.number,
        openBlock: t.number,
      }),
    ),
    t.readonly(
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
    ),
  ]),
]);
export type Channel = t.TypeOf<typeof Channel>;

/**
 * Channels is a mapping from tokenNetwork -> partner -> Channel
 * As in: { [tokenNetwork: Address]: { [partner: Address]: Channel } }
 * It's used as codec and type for 'channels' key in RaidenState
 * We use t.string instead of the Address branded codecs because specialized types can't be used
 * as index mapping keys.
 */
export const Channels = t.readonly(
  t.record(
    t.string /* tokenNetwork: Address */,
    t.readonly(t.record(t.string /* partner: Address */, Channel)),
  ),
);
export type Channels = t.TypeOf<typeof Channels>;

/**
 * Public exposed channels interface (Raiden.channels$)
 *
 * This should be only used as a public view of the internal channel state
 */
export interface RaidenChannel {
  token: Address;
  tokenNetwork: Address;
  partner: Address;
  state: ChannelState;
  ownDeposit: BigNumber;
  partnerDeposit: BigNumber;
  // balance is difference between partner's sent tokens minus own sent tokens
  // as of now we can only send, balance usually is a negative number, as once you send
  // X tokens, you have X less tokens than before, and initial balance is zero
  balance: BigNumber;
  // "distributable" capacity of channel, sum of own total deposit and balance (which as usually
  // negative, decreases capacity)
  capacity: BigNumber;
  id?: number;
  settleTimeout?: number;
  openBlock?: number;
  closeBlock?: number;
}

/**
 * Public exposed aggregated channels mapping
 *
 * token => partner => RaidenChannel
 */
export interface RaidenChannels {
  [token: string]: { [partner: string]: RaidenChannel };
}
