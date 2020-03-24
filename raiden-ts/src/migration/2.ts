/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Adds: Channel.closeParticipant, TransferState.partner & RaidenState.received
 *
 * @param state - RaidenState version 1
 * @returns State version 2
 */
export default function migrate2(state: any) {
  for (const partnerChannels of Object.values<any>(state.channels)) {
    for (const channel of Object.values<any>(partnerChannels)) {
      if (channel.closeBlock) {
        // assume we were the ones closing the channel
        Object.assign(channel, { closeParticipant: state.address });
      }
    }
  }

  const sent = state.sent;
  for (const t of Object.values<any>(sent)) {
    Object.assign(t, { partner: t.transfer[1].recipient });
  }

  Object.assign(state, { received: {} });
  return state;
}
