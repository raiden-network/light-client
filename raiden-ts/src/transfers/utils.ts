import { concat, hexlify } from 'ethers/utils/bytes';
import { keccak256, randomBytes, bigNumberify, sha256 } from 'ethers/utils';

import { Hash, Secret, UInt, HexString } from '../utils/types';
import { encode } from '../utils/data';
import { Lock } from '../channels/types';
import { TransferState, RaidenTransfer, RaidenTransferStatus } from './state';

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
  return bigNumberify(randomBytes(8)) as UInt<8>;
}

/**
 * Generates a message identifier, as an UInt<8> (64 bits)
 *
 * @returns UInt<8>
 */
export function makeMessageId(): UInt<8> {
  return bigNumberify(Date.now()) as UInt<8>;
}

function getTimeIfPresent<T>(k: keyof T): (o: T) => number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (o: T) => (o[k] ? (o[k] as any)[0] : undefined);
}

const statusesMap: { [K in RaidenTransferStatus]: (s: TransferState) => number | undefined } = {
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
 * Convert a state.sent: TransferState to a public RaidenTransfer object
 *
 * @param sent - RaidenState.sent value
 * @returns Public raiden sent transfer info object
 */
export function raidenSentTransfer(sent: TransferState): RaidenTransfer {
  const startedAt = new Date(sent.transfer[0]);
  let changedAt = startedAt;
  let status = RaidenTransferStatus.pending;
  // order matters! from top to bottom priority, first match breaks loop
  for (const [s, g] of Object.entries(statusesMap)) {
    const ts = g(sent);
    if (ts !== undefined) {
      status = s as RaidenTransferStatus;
      changedAt = new Date(ts);
      break;
    }
  }
  const transfer = sent.transfer[1];
  const value = transfer.lock.amount.sub(sent.fee);
  const invalidSecretRequest = sent.secretRequest && sent.secretRequest[1].amount.lt(value);
  const success =
    sent.secretReveal || sent.unlock || sent.secret?.[1]?.registerBlock
      ? true
      : invalidSecretRequest || sent.refund || sent.lockExpired || sent.channelClosed
      ? false
      : undefined;
  const completed = !!(
    sent.unlockProcessed ||
    sent.lockExpiredProcessed ||
    sent.secret?.[1]?.registerBlock ||
    sent.channelClosed
  );
  return {
    secrethash: transfer.lock.secrethash,
    direction: 'sent',
    status,
    initiator: transfer.initiator,
    partner: transfer.recipient,
    target: transfer.target,
    metadata: transfer.metadata,
    paymentId: transfer.payment_identifier,
    chainId: transfer.chain_id.toNumber(),
    token: transfer.token,
    tokenNetwork: transfer.token_network_address,
    channelId: transfer.channel_identifier,
    value,
    fee: sent.fee,
    amount: transfer.lock.amount,
    expirationBlock: transfer.lock.expiration.toNumber(),
    startedAt,
    changedAt,
    success,
    completed,
  };
}
