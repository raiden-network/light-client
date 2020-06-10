/* eslint-disable @typescript-eslint/no-explicit-any */

import { bigNumberify } from 'ethers/utils';

/**
 * Adds: withdrawRequests and nextNonce to channels ends
 *
 * @param state - RaidenState version 3
 * @returns State version 4
 */
export default function migrate4(state: any) {
  for (const channel of Object.values<any>(state.channels)) {
    for (const end of ['own', 'partner'] as const) {
      Object.assign(channel[end], {
        withdrawRequests: [],
        nextNonce: bigNumberify(channel[end].balanceProof.nonce).add(1).toString(),
      });
    }
  }
  return state;
}
