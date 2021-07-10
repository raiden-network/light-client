import { getAddress } from '@ethersproject/address';
import { hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { randomBytes } from '@ethersproject/random';
import { computePublicKey } from '@ethersproject/signing-key';

import type { Address, Hash, PublicKey } from '@/utils/types';

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

/**
 * Generate a random public key
 *
 * @returns public key
 */
export function makePublicKey() {
  return computePublicKey(makeHash()) as PublicKey;
}

/**
 * Asynchronously wait for some time
 *
 * @param ms - milliseconds to wait
 * @returns Promise to void
 */
export async function sleep(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(() => process.nextTick(resolve), ms));
}
