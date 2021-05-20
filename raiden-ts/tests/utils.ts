import { getAddress } from '@ethersproject/address';
import { hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { randomBytes } from '@ethersproject/random';

import type { Address, Hash } from '@/utils/types';

/**
 * Generate a random address
 *
 * @returns address
 */
export function makeAddress() {
  return getAddress(hexlify(randomBytes(20))) as Address;
}

/**
 * Generate a random hash
 *
 * @returns hash
 */
export function makeHash() {
  return keccak256(randomBytes(32)) as Hash;
}
