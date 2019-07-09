import { getType } from 'typesafe-actions';
import { get, set } from 'lodash/fp';
import { One } from 'ethers/constants';

import { RaidenState } from '../store/state';
import { RaidenAction } from '../actions';
import { Channel } from '../channels/state';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { initialState } from '../store/state';
import { SentTransfer } from './state';
import { transferSigned, transferSecret, transferProcessed } from './actions';

// handles all transfers actions and requests
export const transfersReducer = (
  state: Readonly<RaidenState> = initialState,
  action: RaidenAction,
): RaidenState => {
  switch (action.type) {
    case getType(transferSecret):
      if (action.meta.secrethash in state.secrets) return state;
      return {
        ...state,
        secrets: {
          ...state.secrets,
          [action.meta.secrethash]: action.payload,
        },
      };

    case getType(transferSigned): {
      const transfer = action.payload,
        secrethash = transfer.lock.secrethash;
      // transferSigned must be the first action, to init SentTransfer state
      if (secrethash in state.sent) return state;
      const channelPath = ['channels', transfer.token_network_address, transfer.recipient];
      let channel: Channel | undefined = get(channelPath, state);
      if (
        !channel ||
        !(channel.own.balanceProof ? channel.own.balanceProof.nonce.add(1) : One).eq(
          transfer.nonce, // nonce must be next or first!
        )
      )
        return state;

      channel = {
        ...channel,
        own: {
          ...channel.own,
          locks: [...(channel.own.locks || []), transfer.lock], // append lock
          // set current/latest channel.own.balanceProof to LockedTransfer's
          balanceProof: getBalanceProofFromEnvelopeMessage(transfer),
        },
      };
      const sentTransfer: SentTransfer = { transfer };

      state = set(channelPath, channel, state);
      state = set(['sent', secrethash], sentTransfer, state);
      return state;
    }

    case getType(transferProcessed):
      if (!(action.meta.secrethash in state.sent)) return state;
      return {
        ...state,
        sent: {
          ...state.sent,
          [action.meta.secrethash]: {
            ...state.sent[action.meta.secrethash],
            transferProcessed: action.payload,
          },
        },
      };

    default:
      return state;
  }
};
