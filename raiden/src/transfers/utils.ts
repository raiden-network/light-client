import { concat } from 'ethers/utils/bytes';
import { keccak256 } from 'ethers/utils';
import { HashZero } from 'ethers/constants';
import { isEmpty } from 'lodash';

import { Hash } from '../utils/types';
import { encode } from '../utils/data';
import { Lock } from '../channels/state';

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
