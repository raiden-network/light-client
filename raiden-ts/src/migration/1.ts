/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Move secrets to 'secret' member of the respective TransferState
 *
 * @param state - RaidenState version 0
 * @returns State version 1
 */
export default function migrate1(state: any) {
  const sent = state.sent;
  for (const [h, t] of Object.entries<any>(sent)) {
    if (state.secrets[h]) {
      Object.assign(t, {
        secret: [
          t.secretReveal?.[0] ?? t.transfer[0],
          { value: state.secrets[h].secret, registerBlock: state.secrets[h].registerBlock ?? 0 },
        ],
      });
    }
  }
  delete state['secrets'];
  return state;
}
