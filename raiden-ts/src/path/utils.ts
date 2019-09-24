import { Zero } from 'ethers/constants';
import { RaidenState } from '../state';
import { Address, UInt } from '../utils/types';
import { Presences } from '../transport/types';
import { ChannelState } from '../channels/state';

/**
 * Either returns true if given channel can route a payment, or a reason as string if not
 *
 * @param state - current RaidenState
 * @param presences - latest Presences mapping
 * @param tokenNetwork - tokenNetwork where the channel is
 * @param partner - possibly a partner on given tokenNetwork
 * @param amount - amount of tokens to check if channel can route
 * @returns true if channel can route, string containing reason if not
 */
export function channelCanRoute(
  state: RaidenState,
  presences: Presences,
  tokenNetwork: Address,
  partner: Address,
  amount: UInt<32>,
): true | string {
  if (!(partner in presences) || !presences[partner].payload.available)
    return `path: partner "${partner}" not available in transport`;
  if (!(partner in state.channels[tokenNetwork]))
    return `path: there's no direct channel with partner "${partner}"`;
  const channel = state.channels[tokenNetwork][partner];
  if (channel.state !== ChannelState.open)
    return `path: channel with "${partner}" in state "${channel.state}" instead of "${ChannelState.open}"`;
  const capacity = channel.own.deposit
    .sub(
      channel.own.balanceProof
        ? channel.own.balanceProof.transferredAmount.add(channel.own.balanceProof.lockedAmount)
        : Zero,
    )
    .add(
      // only relevant once we can receive from partner
      channel.partner.balanceProof ? channel.partner.balanceProof.transferredAmount : Zero,
    );
  if (capacity.lt(amount))
    return `path: channel with "${partner}" don't have enough capacity=${capacity.toString()}`;
  return true;
}
