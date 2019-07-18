import { concat, hexlify } from 'ethers/utils/bytes';
import { keccak256, randomBytes, bigNumberify } from 'ethers/utils';
import { HashZero } from 'ethers/constants';
import { isEmpty } from 'lodash';

import { Hash, Secret, UInt } from '../utils/types';
import { encode } from '../utils/data';
import { Lock } from '../channels/types';

/**
 * Return the hash of a lock
 * @param lock The lock to have the hash calculated from
 * @returns hash of lock
 */
export function lockhash(lock: Lock) {
  return keccak256(
    concat([encode(lock.expiration, 32), encode(lock.amount, 32), lock.secrethash]),
  ) as Hash;
}

/**
 * Get the locksroot of a given locks array using keccak256
 * On Red-Eyes, locksroot is the root of the merkle tree of the hashes of the locks
 * TODO: replace by list concat hash instead, after moving to raiden-contracts@^0.25
 * @param locks Lock array to calculate the locksroot from
 * @returns hash of the locks array
 */
export function getLocksroot(locks: readonly Lock[]): Hash {
  if (isEmpty(locks)) return HashZero as Hash;
  const leaves = locks.map(lockhash);

  while (leaves.length > 1) {
    for (let i = 0; i < leaves.length - 1; i++) {
      leaves.splice(i, 2, keccak256(leaves[i] + leaves[i + 1].substr(2)) as Hash);
    }
  }

  return leaves[0]; // merkle tree root
}

/**
 * Generates a random secret of given length, as an HexString<32>
 * @param length of the secret to generate
 * @returns HexString<32>
 */
export function makeSecret(length: number = 32): Secret {
  return hexlify(randomBytes(length)) as Secret;
}

/**
 * Generates a random payment identifier, as an UInt<8> (64 bits)
 * @returns UInt<8>
 */
export function makePaymentId(): UInt<8> {
  return bigNumberify(randomBytes(8)) as UInt<8>;
}

/**
 * Generates a message identifier, as an UInt<8> (64 bits)
 * @returns UInt<8>
 */
export function makeMessageId(): UInt<8> {
  return bigNumberify(Date.now()) as UInt<8>;
}
