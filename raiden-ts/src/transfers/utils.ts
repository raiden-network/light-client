import { concat, hexlify } from 'ethers/utils/bytes';
import { keccak256, randomBytes, bigNumberify, sha256 } from 'ethers/utils';

import { Hash, Secret, UInt, HexString } from '../utils/types';
import { encode } from '../utils/data';
import { Lock } from '../channels/types';
import { SentTransfer, RaidenSentTransfer, RaidenSentTransferStatus } from './state';

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

/**
 * Convert a state.sent: SentTransfer to a public RaidenSentTransfer object
 *
 * @param sent - RaidenState.sent value
 * @returns Public raiden sent transfer info object
 */
export function raidenSentTransfer(sent: SentTransfer): RaidenSentTransfer {
  const [status, changedAt]: [RaidenSentTransferStatus, number] = sent.lockExpiredProcessed
    ? [RaidenSentTransferStatus.expired, sent.lockExpiredProcessed[0]]
    : sent.unlockProcessed
    ? [RaidenSentTransferStatus.unlocked, sent.unlockProcessed[0]]
    : sent.lockExpired
    ? [RaidenSentTransferStatus.expiring, sent.lockExpired[0]]
    : sent.unlock
    ? [RaidenSentTransferStatus.unlocking, sent.unlock[0]]
    : sent.secretReveal
    ? [RaidenSentTransferStatus.revealed, sent.secretReveal[0]]
    : sent.secretRequest
    ? [RaidenSentTransferStatus.requested, sent.secretRequest[0]]
    : sent.channelClosed // channelClosed before revealing
    ? [RaidenSentTransferStatus.closed, sent.channelClosed[0]]
    : sent.refund
    ? [RaidenSentTransferStatus.refunded, sent.refund[0]]
    : sent.transferProcessed
    ? [RaidenSentTransferStatus.received, sent.transferProcessed[0]]
    : [RaidenSentTransferStatus.pending, sent.transfer[0]];
  const value = sent.transfer[1].lock.amount.sub(sent.fee);
  const invalidSecretRequest = sent.secretRequest && sent.secretRequest[1].amount.lt(value);
  const success: boolean | undefined =
      sent.secretReveal || sent.unlock
        ? true
        : invalidSecretRequest || sent.refund || sent.lockExpired || sent.channelClosed
        ? false
        : undefined,
    completed = !!(sent.unlockProcessed || sent.lockExpiredProcessed || sent.channelClosed);
  return {
    secrethash: sent.transfer[1].lock.secrethash,
    status,
    initiator: sent.transfer[1].initiator,
    recipient: sent.transfer[1].recipient,
    target: sent.transfer[1].target,
    metadata: sent.transfer[1].metadata,
    paymentId: sent.transfer[1].payment_identifier,
    chainId: sent.transfer[1].chain_id.toNumber(),
    token: sent.transfer[1].token,
    tokenNetwork: sent.transfer[1].token_network_address,
    channelId: sent.transfer[1].channel_identifier,
    value,
    fee: sent.fee,
    amount: sent.transfer[1].lock.amount,
    expirationBlock: sent.transfer[1].lock.expiration.toNumber(),
    startedAt: new Date(sent.transfer[0]),
    changedAt: new Date(changedAt),
    success,
    completed,
  };
}
