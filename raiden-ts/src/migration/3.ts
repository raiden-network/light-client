/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Adds: Channel.closeParticipant, TransferState.partner & RaidenState.received
 *
 * @param state - RaidenState version 2
 * @returns State version 3
 */
export default function migrate3(state: any) {
  for (const partnerChannels of Object.values<any>(state.channels)) {
    for (const channel of Object.values<any>(partnerChannels)) {
      // rename messageHash to additionalHash, remove unused sender from BP
      if (channel.own.balanceProof) {
        Object.assign(channel.own.balanceProof, {
          additionalHash: channel.own.balanceProof.messageHash,
        });
        delete channel.own.balanceProof.messageHash;
        delete channel.own.balanceProof.sender;
      }
      if (channel.partner.balanceProof) {
        Object.assign(channel.partner.balanceProof, {
          additionalHash: channel.partner.balanceProof.messageHash,
        });
        delete channel.partner.balanceProof.messageHash;
        delete channel.partner.balanceProof.sender;
      }
    }
  }
  return state;
}
