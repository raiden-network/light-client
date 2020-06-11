/* eslint-disable @typescript-eslint/no-explicit-any */
import { Zero } from 'ethers/constants';
import findKey from 'lodash/findKey';

import { BalanceProofZero } from '../channels';

function migrateChannelEnd(channel: any, endsAddr: any) {
  for (const [prop, addr] of Object.entries<any>(endsAddr)) {
    if (channel[prop].balanceProof) {
      Object.assign(channel[prop].balanceProof, {
        additionalHash: channel[prop].balanceProof.messageHash,
      });
      delete channel[prop].balanceProof.messageHash;
      delete channel[prop].balanceProof.sender;
    } else {
      Object.assign(channel[prop], { balanceProof: BalanceProofZero, locks: [] });
    }
    Object.assign(channel[prop], { address: addr });
    if (!('withdraw' in channel[prop])) {
      Object.assign(channel[prop], { withdraw: Zero });
    }
  }
}

/**
 * Adds: Channel.closeParticipant, TransferState.partner & RaidenState.received
 *
 * @param state - RaidenState version 2
 * @returns State version 3
 */
export default function migrate3(state: any) {
  const newChannels = {};
  for (const [tokenNetwork, partnerChannels] of Object.entries<any>(state.channels)) {
    for (const [partner, channel] of Object.entries<any>(partnerChannels)) {
      migrateChannelEnd(channel, { own: state.address, partner });
      // rename messageHash to additionalHash, remove unused sender from BP
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork);
      Object.assign(channel, { token, tokenNetwork });
      Object.assign(newChannels, { [`${partner}@${tokenNetwork}`]: channel });
    }
  }
  Object.assign(state, { channels: newChannels, oldChannels: {} });
  Object.assign(state, { transport: state.transport.matrix ?? {} });
  Object.assign(state, { iou: state.path.iou });
  delete state.path;
  return state;
}
