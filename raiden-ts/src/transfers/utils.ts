import { concat, hexlify } from 'ethers/utils/bytes';
import { keccak256, randomBytes, bigNumberify, sha256 } from 'ethers/utils';
import { HashZero } from 'ethers/constants';

import { assert } from '../utils';
import { Hash, Secret, UInt, HexString, Address, isntNil } from '../utils/types';
import { encode } from '../utils/data';
import { Lock, BalanceProofZero } from '../channels/types';
import { getBalanceProofFromEnvelopeMessage, createBalanceHash } from '../messages';
import {
  TransferState,
  RaidenTransfer,
  RaidenTransferStatus,
  Direction,
  TransfersState,
} from './state';

/**
 * Get the locksroot of a given array of pending locks
 * On Alderaan, it's the keccak256 hash of the concatenation of the ordered locks data
 *
 * @param locks - Lock array to calculate the locksroot from
 * @returns hash of the locks array
 */
export function getLocksroot(locks: readonly Lock[]): Hash {
  const encoded: HexString[] = [];
  for (const lock of locks)
    encoded.push(encode(lock.expiration, 32), encode(lock.amount, 32), lock.secrethash);
  return keccak256(concat(encoded)) as Hash;
}

/**
 * Return the secrethash of a given secret
 * On Alderaan, the sha256 hash is used for the secret.
 *
 * @param secret - Secret to get the hash from
 * @returns hash of the secret
 */
export function getSecrethash(secret: Secret): Hash {
  return sha256(secret) as Hash;
}

/**
 * Generates a random secret of given length, as an HexString<32>
 *
 * @param length - of the secret to generate
 * @returns HexString<32>
 */
export function makeSecret(length = 32): Secret {
  return hexlify(randomBytes(length)) as Secret;
}

/**
 * Generates a random payment identifier, as an UInt<8> (64 bits)
 *
 * @returns UInt<8>
 */
export function makePaymentId(): UInt<8> {
  return bigNumberify(Date.now()) as UInt<8>;
}

/**
 * Generates a message identifier, as an UInt<8> (64 bits)
 *
 * @returns UInt<8>
 */
export function makeMessageId(): UInt<8> {
  return bigNumberify(Date.now()) as UInt<8>;
}

/**
 * Return the transfer direction for a TransferState
 *
 * @param state - transfer to get direction from, or TransferId
 * @returns Direction of transfer
 */
export function transferDirection(state: TransferState | { direction: Direction }): Direction {
  if ('direction' in state) return state.direction;
  const transfer = state.transfer[1];
  return transfer.recipient === state.partner ? Direction.SENT : Direction.RECEIVED;
}

/**
 * Get a unique key for a tranfer state or TransferId
 *
 * @param state - transfer to get key from, or TransferId
 * @returns string containing a unique key for transfer
 */
export function transferKey(
  state: TransferState | { secrethash: Hash; direction: Direction },
): string {
  if ('direction' in state) return `${state.direction}:${state.secrethash}`;
  return `${transferDirection(state)}:${state.transfer[1].lock.secrethash}`;
}

const _keyRe = new RegExp(`^(${Object.values(Direction).join('|')}):0x[a-z0-9]{64}$`, 'i');
/**
 * Parse a transferKey into a TransferId object ({ secrethash, direction })
 *
 * @param key - string to parse as transferKey
 * @returns secrethash, direction contained in transferKey
 */
export function transferKeyToMeta(key: string): { secrethash: Hash; direction: Direction } {
  assert(_keyRe.test(key), 'Invalid transferKey format');
  const [direction, secrethash] = key.split(':');
  return { direction: direction as Direction, secrethash: secrethash as Hash };
}

function getTimeIfPresent<T>(k: keyof T): (o: T) => number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (o: T) => (o[k] ? (o[k] as any)[0] : undefined);
}

const statusesMap: { [K in RaidenTransferStatus]: (t: TransferState) => number | undefined } = {
  [RaidenTransferStatus.expired]: getTimeIfPresent<TransferState>('lockExpiredProcessed'),
  [RaidenTransferStatus.unlocked]: getTimeIfPresent<TransferState>('unlockProcessed'),
  [RaidenTransferStatus.expiring]: getTimeIfPresent<TransferState>('lockExpired'),
  [RaidenTransferStatus.unlocking]: getTimeIfPresent<TransferState>('unlock'),
  [RaidenTransferStatus.registered]: (sent: TransferState) =>
    // only set status as registered if there's a valid registerBlock
    sent.secret?.[1]?.registerBlock ? sent.secret[0] : undefined,
  [RaidenTransferStatus.revealed]: getTimeIfPresent<TransferState>('secretReveal'),
  [RaidenTransferStatus.requested]: getTimeIfPresent<TransferState>('secretRequest'),
  [RaidenTransferStatus.closed]: getTimeIfPresent<TransferState>('channelClosed'),
  [RaidenTransferStatus.refunded]: getTimeIfPresent<TransferState>('refund'),
  [RaidenTransferStatus.received]: getTimeIfPresent<TransferState>('transferProcessed'),
  [RaidenTransferStatus.pending]: getTimeIfPresent<TransferState>('transfer'),
};

/**
 * Convert a TransferState to a public RaidenTransfer object
 *
 * @param state - RaidenState.sent value
 * @returns Public raiden sent transfer info object
 */
export function raidenTransfer(state: TransferState): RaidenTransfer {
  const startedAt = new Date(state.transfer[0]);
  let changedAt = startedAt;
  let status = RaidenTransferStatus.pending;
  // order matters! from top to bottom priority, first match breaks loop
  for (const [s, g] of Object.entries(statusesMap)) {
    const ts = g(state);
    if (ts !== undefined) {
      status = s as RaidenTransferStatus;
      changedAt = new Date(ts);
      break;
    }
  }
  const transfer = state.transfer[1];
  const direction = transferDirection(state);
  const value = transfer.lock.amount.sub(state.fee);
  const invalidSecretRequest = state.secretRequest && state.secretRequest[1].amount.lt(value);
  const success =
    state.secretReveal || state.unlock || state.secret?.[1]?.registerBlock
      ? true
      : invalidSecretRequest || state.refund || state.lockExpired || state.channelClosed
      ? false
      : undefined;
  const completed = !!(
    state.unlockProcessed ||
    state.lockExpiredProcessed ||
    state.secret?.[1]?.registerBlock ||
    state.channelClosed
  );
  return {
    key: transferKey(state),
    secrethash: transfer.lock.secrethash,
    direction,
    status,
    initiator: transfer.initiator,
    partner: state.partner,
    target: transfer.target,
    metadata: transfer.metadata,
    paymentId: transfer.payment_identifier,
    chainId: transfer.chain_id.toNumber(),
    token: transfer.token,
    tokenNetwork: transfer.token_network_address,
    channelId: transfer.channel_identifier,
    value,
    fee: state.fee,
    amount: transfer.lock.amount,
    expirationBlock: transfer.lock.expiration.toNumber(),
    startedAt,
    changedAt,
    success,
    completed,
    secret: state.secret?.[1]?.value,
  };
}

/**
 * Look for a BalanceProof matching given balanceHash among EnvelopeMessages in transfers
 *
 * @param transfers - RaidenState['received' | 'sent'] mapping
 * @param balanceHash -
 * @param channel - Channel key of hash
 * @param channel.tokenNetwork - channel's tokenNetwork
 * @param channel.partner - channel's partner
 * @returns BalanceProof matching balanceHash or undefined
 */
export function findBalanceProofMatchingBalanceHash(
  transfers: TransfersState,
  balanceHash: Hash,
  { tokenNetwork, partner }: { tokenNetwork: Address; partner: Address },
) {
  if (balanceHash === HashZero) return BalanceProofZero;
  // later transfers have higher chance of being the right one, iterate in reverse order
  for (const transfer of Object.values(transfers).reverse()) {
    if (
      transfer.transfer[1].token_network_address === tokenNetwork &&
      transfer.partner === partner
    ) {
      // EnvelopeMessages: messages bearing a BalanceProof
      const bp = [transfer.transfer[1], transfer.unlock?.[1], transfer.lockExpired?.[1]]
        .filter(isntNil)
        .map(getBalanceProofFromEnvelopeMessage)
        .find((bp) => createBalanceHash(bp) === balanceHash);
      if (bp) return bp;
    }
  }
}
