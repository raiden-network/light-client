/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Transform timed tuples to { ...obj, ts: number } extended objects
 *
 * @param state - RaidenState version 5
 * @returns State version 6
 */
export default function migrate6(state: any) {
  for (const direction of ['sent', 'received']) {
    for (const transfer of Object.values<any>(state[direction])) {
      for (const [k, v] of Object.entries(transfer)) {
        if (!Array.isArray(v) || v.length !== 2 || typeof v[1] !== 'object') continue;
        Object.assign(transfer, { [k]: { ...v[1], ts: v[0] } });
      }
      const closed = transfer.channelClosed;
      if (closed) {
        Object.assign(transfer, {
          channelClosed: { txHash: closed[1], txBlock: 0, ts: closed[0] },
        });
      }
    }
  }
  return state;
}
