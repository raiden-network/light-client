import * as t from 'io-ts';
import { BigNumber } from 'ethers/utils';

import { UInt, Address, Signed, Int } from '../utils/types';
import { WithdrawRequest, WithdrawExpired, WithdrawConfirmation } from '../messages';
import { Lock, BalanceProof } from './types';

export enum ChannelState {
  open = 'open',
  closing = 'closing',
  closed = 'closed',
  settleable = 'settleable',
  settling = 'settling',
  settled = 'settled',
}

/**
 * Contains info of each side of a channel
 */
const _ChannelEnd = t.readonly(
  t.type({
    address: Address,
    deposit: UInt(32), // total deposit/contract balance
    withdraw: UInt(32),
    locks: t.readonlyArray(Lock),
    balanceProof: Signed(BalanceProof),
    pendingWithdraws: t.readonlyArray(
      t.union([Signed(WithdrawRequest), Signed(WithdrawConfirmation), Signed(WithdrawExpired)]),
    ),
    nextNonce: UInt(8), // usually balanceProof.nonce+1, but withdraw messages also increment it
  }),
);
export interface ChannelEnd extends t.TypeOf<typeof _ChannelEnd> {}
export interface ChannelEndC extends t.Type<ChannelEnd, t.OutputOf<typeof _ChannelEnd>> {}
export const ChannelEnd: ChannelEndC = _ChannelEnd;

export const Channel = t.intersection([
  // readonly needs to be applied to the individual types to allow tagged union narrowing
  t.readonly(
    t.type({
      id: t.number,
      token: Address,
      tokenNetwork: Address,
      settleTimeout: t.number,
      isFirstParticipant: t.boolean,
      openBlock: t.number,
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
    t.readonly(
      t.type({
        state: t.union([t.literal(ChannelState.open), t.literal(ChannelState.closing)]),
      }),
    ),
    t.intersection([
      t.readonly(
        t.type({
          closeBlock: t.number,
          closeParticipant: Address,
        }),
      ),
      t.union([
        t.readonly(
          t.type({
            state: t.union([
              t.literal(ChannelState.closed),
              t.literal(ChannelState.settleable),
              t.literal(ChannelState.settling),
            ]),
          }),
        ),
        t.readonly(
          t.type({
            state: t.literal(ChannelState.settled),
            settleBlock: t.number,
          }),
        ),
      ]),
    ]),
  ]),
]);
export type Channel = t.TypeOf<typeof Channel>;

export interface ChannelBalances {
  ownDeposit: UInt<32>; // on-chain totalDeposit
  ownWithdraw: UInt<32>; // on-chain totalWithdraw
  ownTransferred: UInt<32>; // off-chain unlocked
  ownLocked: UInt<32>; // sum of locks not unlocked on- nor off-chain
  ownBalance: Int<32>; // received minus paid, unlocked either on- or off-chain
  ownCapacity: UInt<32>; // how much still available to be sent on channel
  ownOnchainUnlocked: UInt<32>; // total of locks registered on-chain and not unlocked off-chain
  ownUnlocked: UInt<32>; // off & on-chain unlocked amount *sent* from this end
  ownTotalWithdrawable: UInt<32>; // total which can be sent in a setTotalWithdraw call
  ownWithdrawable: UInt<32>; // maximum amount available currently to be withdrawn
  partnerDeposit: UInt<32>;
  partnerWithdraw: UInt<32>;
  partnerTransferred: UInt<32>;
  partnerLocked: UInt<32>;
  partnerBalance: Int<32>;
  partnerCapacity: UInt<32>;
  partnerOnchainUnlocked: UInt<32>;
  partnerUnlocked: UInt<32>;
  partnerTotalWithdrawable: UInt<32>;
  partnerWithdrawable: UInt<32>;
}

/**
 * Public exposed channels interface (Raiden.channels$)
 *
 * This should be only used as a public view of the internal channel state
 * It contains some details about channel's current state, and some balances.
 * Most relevant are:
 * - state: one of 'open', 'closing', 'closed', 'settleable' or 'settling'
 * - id: channel identifier
 * - token: ERC20 token contract address
 * - tokenNetwork: TokenNetwork contract address
 * - settleTimeout: number of blocks after close when channel becomes settleable
 * - openBlock: block number in which channel was opened
 * - closeBlock: block in which channel got closed
 * - partner: partner's address
 * - balance: how much was sent (negative) plus received on this channel from partner
 * - capacity: how much still can be transferred through this channel; increases with deposit
 * - Balances [for each property, prefixed with either 'own' or 'partner']:
 *   - Deposit: on-chain totalDeposit
 *   - Withdraw: on-chain totalWithdraw
 *   - Unlocked: how much was received and unlocked on this channel's end
 *   - Locked: how much is still locked off-chain on this channel's end
 *   - Balance: received minus sent off-chain
 *   - Capacity: channel end's liquidity
 *   - Withdrawable: amount which can still be withdrawn
 */
export interface RaidenChannel extends ChannelBalances {
  state: ChannelState;
  id: number;
  token: Address;
  tokenNetwork: Address;
  settleTimeout: number;
  openBlock: number;
  closeBlock?: number;
  partner: Address;
  // balance is difference between partner's sent tokens minus own sent tokens
  // as of now we can only send, balance usually is a negative number, as once you send
  // X tokens, you have X less tokens than before, and initial balance is zero
  balance: BigNumber;
  // "distributable" capacity of channel, sum of own total deposit and balance (which as usually
  // negative, decreases capacity)
  capacity: BigNumber;
}

/**
 * Public exposed aggregated channels mapping
 *
 * token => partner => RaidenChannel
 */
export interface RaidenChannels {
  [token: string]: { [partner: string]: RaidenChannel };
}
