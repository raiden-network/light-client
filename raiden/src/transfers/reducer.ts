import { getType } from 'typesafe-actions';
import { set } from 'lodash/fp';
import { One } from 'ethers/constants';

import { Secret } from '../utils/types';
import { partialCombineReducers } from '../utils/redux';
import { RaidenAction } from '../actions';
import { transferSigned, transferSecret } from './actions';
import { Channel, Channels } from '../channels/state';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { initialState } from '../store/state';
import { SentTransfer } from './state';

// state.tokens specific reducer, handles only tokenMonitored action
const secrets = (
  state: Readonly<{
    [secrethash: string]: { secret: Secret; registerBlock?: number };
  }> = initialState.secrets,
  action: RaidenAction,
) => {
  switch (action.type) {
    case getType(transferSecret):
      if (action.meta.secrethash in state) return state;
      return { ...state, [action.meta.secrethash]: action.payload };
    default:
      return state;
  }
};

// handles all channel actions and requests
const channels = (state: Readonly<Channels> = initialState.channels, action: RaidenAction) => {
  switch (action.type) {
    case getType(transferSigned): {
      let channel: Channel | undefined =
        state[action.payload.token_network_address] &&
        state[action.payload.token_network_address][action.payload.recipient];
      if (
        !channel ||
        !(channel.own.balanceProof ? channel.own.balanceProof.nonce.add(1) : One).eq(
          action.payload.nonce, // nonce must be next or first!
        )
      )
        return state;
      const key = action.payload.payment_identifier.toString();
      // on transferSigned, there must not be a SentTransfer with same paymentId
      if (channel.sent && key in channel.sent) return state;
      const sentTransfer: SentTransfer = { transfer: action.payload },
        balanceProof = getBalanceProofFromEnvelopeMessage(action.payload);
      channel = {
        ...channel,
        own: {
          ...channel.own,
          locks: [...(channel.own.locks || []), action.payload.lock], // append lock
          balanceProof, // set current/latest channel.own.balanceProof to LockedTransfer's
        },
        sent: {
          ...channel.sent,
          [key]: sentTransfer,
        },
      };
      return set([action.payload.token_network_address, action.payload.recipient], channel, state);
    }

    default:
      return state;
  }
};

/**
 * Nested/combined reducer for channels
 * blockNumber, tokens & channels reducers get its own slice of the state, corresponding to the
 * name of the reducer. channels root reducer instead must be handled the complete state instead,
 * so it compose the output with each key/nested/combined state.
 */
export const transfersReducer = partialCombineReducers({ secrets, channels }, initialState);
