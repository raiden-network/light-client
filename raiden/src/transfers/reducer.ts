import { isActionOf } from 'typesafe-actions';
import { get, set, unset } from 'lodash/fp';
import { One } from 'ethers/constants';

import { RaidenState } from '../store/state';
import { RaidenAction } from '../actions';
import { Channel } from '../channels/state';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { initialState } from '../store/state';
import { SentTransfer } from './state';
import {
  transferSigned,
  transferSecret,
  transferProcessed,
  transferSecretReveal,
  transferUnlock,
  transferUnlockProcessed,
} from './actions';

// handles all transfers actions and requests
export function transfersReducer(
  state: Readonly<RaidenState> = initialState,
  action: RaidenAction,
): RaidenState {
  if (isActionOf(transferSecret, action)) {
    if (
      action.meta.secrethash in state.secrets &&
      state.secrets[action.meta.secrethash].registerBlock
    )
      return state; // avoid storing without registerBlock if we already got with
    return {
      ...state,
      secrets: {
        ...state.secrets,
        [action.meta.secrethash]: action.payload,
      },
    };
  } else if (isActionOf(transferSigned, action)) {
    const transfer = action.payload.message,
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
        history: {
          ...channel.own.history,
          [Date.now()]: transfer,
        },
      },
    };
    const sentTransfer: SentTransfer = { transfer };

    state = set(channelPath, channel, state);
    state = set(['sent', secrethash], sentTransfer, state);
    return state;
  } else if (isActionOf(transferProcessed, action)) {
    if (!(action.meta.secrethash in state.sent)) return state;
    return {
      ...state,
      sent: {
        ...state.sent,
        [action.meta.secrethash]: {
          ...state.sent[action.meta.secrethash],
          transferProcessed: action.payload.message,
        },
      },
    };
  } else if (isActionOf(transferSecretReveal, action)) {
    if (!(action.meta.secrethash in state.sent)) return state;
    return {
      ...state,
      sent: {
        ...state.sent,
        [action.meta.secrethash]: {
          ...state.sent[action.meta.secrethash],
          secretReveal: action.payload.message,
        },
      },
    };
  } else if (isActionOf(transferUnlock, action)) {
    const unlock = action.payload.message,
      secrethash = action.meta.secrethash;
    if (!(secrethash in state.sent) || state.sent[secrethash].unlock) return state;
    const transfer = state.sent[secrethash].transfer;
    const channelPath = ['channels', transfer.token_network_address, transfer.recipient];
    let channel: Channel | undefined = get(channelPath, state);
    if (
      !channel ||
      !channel.own.balanceProof ||
      !channel.own.balanceProof.nonce.add(1).eq(unlock.nonce) // nonce must be next
    )
      return state;

    channel = {
      ...channel,
      own: {
        ...channel.own,
        locks: channel.own.locks!.filter(l => l.secrethash !== secrethash), // pop lock
        // set current/latest channel.own.balanceProof to LockedTransfer's
        balanceProof: getBalanceProofFromEnvelopeMessage(unlock),
        history: {
          ...channel.own.history,
          [Date.now()]: unlock,
        },
      },
    };
    const sentTransfer: SentTransfer = { ...state.sent[secrethash], unlock };

    state = set(channelPath, channel, state);
    state = set(['sent', secrethash], sentTransfer, state);
    return state;
  } else if (isActionOf(transferUnlockProcessed, action)) {
    if (!(action.meta.secrethash in state.sent)) return state;
    return unset(['sent', action.meta.secrethash], state);
  } else return state;
}
