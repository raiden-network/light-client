/* eslint-disable @typescript-eslint/no-explicit-any */
import { AddressZero, Zero, HashZero } from 'ethers/constants';
import findKey from 'lodash/findKey';

import { SignatureZero } from '../constants';

/**
 * Adds: Channel.closeParticipant, TransferState.partner & RaidenState.received
 *
 * @param state - RaidenState version 2
 * @returns State version 3
 */
export default function migrate3(state: any) {
  const emptyBP = {
    chainId: Zero,
    tokenNetworkAddress: AddressZero,
    channelId: Zero,
    nonce: Zero,
    transferredAmount: Zero,
    lockedAmount: Zero,
    locksroot: HashZero,
    additionalHash: HashZero,
    signature: SignatureZero,
  };
  const newChannels = {};
  for (const [tokenNetwork, partnerChannels] of Object.entries<any>(state.channels)) {
    for (const [partner, channel] of Object.entries<any>(partnerChannels)) {
      // rename messageHash to additionalHash, remove unused sender from BP
      for (const [prop, addr] of Object.entries<any>({ own: state.address, partner })) {
        if (channel[prop].balanceProof) {
          Object.assign(channel[prop].balanceProof, {
            additionalHash: channel[prop].balanceProof.messageHash,
          });
          delete channel[prop].balanceProof.messageHash;
          delete channel[prop].balanceProof.sender;
        } else {
          Object.assign(channel[prop], { balanceProof: emptyBP, locks: [] });
        }
        Object.assign(channel[prop], { address: addr });
        if (!('withdraw' in channel[prop])) {
          Object.assign(channel[prop], { withdraw: Zero });
        }
      }
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork);
      Object.assign(channel, { token, tokenNetwork });
      Object.assign(newChannels, { [`${partner}@${tokenNetwork}`]: channel });
    }
  }
  Object.assign(state, { channels: newChannels, oldChannels: {} });
  return state;
}
