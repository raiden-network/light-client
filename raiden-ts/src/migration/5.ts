/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Adds: withdrawRequests and nextNonce to channels and oldChannels ends
 *
 * @param state - RaidenState version 4
 * @returns State version 5
 */
export default function migrate5(state: any) {
  for (const channel of Object.values<any>(state.channels).concat(
    Object.values<any>(state.oldChannels),
  )) {
    for (const end of ['own', 'partner'] as const) {
      Object.assign(channel[end], {
        pendingWithdraws: channel[end].withdrawRequests,
      });
      delete channel[end].withdrawRequests;
    }
  }
  return state;
}
