import * as t from 'io-ts';

import { EnumType, Hash, UInt } from '../utils/types';

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
