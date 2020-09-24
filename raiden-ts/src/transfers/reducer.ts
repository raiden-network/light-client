import pick from 'lodash/fp/pick';

import { channelKey, channelUniqueKey } from '../channels/utils';
import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { ChannelState } from '../channels/state';
import { channelClose, channelSettle } from '../channels/actions';
import { timed, UInt } from '../utils/types';
import { Reducer, createReducer } from '../utils/actions';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { Direction } from './state';
import {
  transferSigned,
  transferSecret,
  transferProcessed,
  transferUnlock,
  transferExpire,
  transferSecretReveal,
  transferUnlockProcessed,
  transferExpireProcessed,
  transferSecretRequest,
  transferSecretRegister,
  transferClear,
  transferLoad,
  withdrawMessage,
  withdrawExpire,
  withdrawCompleted,
} from './actions';
import { transferKey } from './utils';

const END = { [Direction.SENT]: 'own', [Direction.RECEIVED]: 'partner' } as const;

// Reducers for different actions
function transferSecretReducer(
  state: RaidenState,
  action: transferSecret | transferSecretRegister.success,
): RaidenState {
  const key = transferKey(action.meta);
  if (!(key in state.transfers)) return state;
  const transferState = state.transfers[key];
  // store when seeing unconfirmed, but registerBlock only after confirmation
  if (!transferState.secret)
    state = {
      ...state,
      transfers: {
        ...state.transfers,
        [key]: {
          ...transferState,
          secret: action.payload.secret,
        },
      },
    };
  // don't overwrite registerBlock if secret already stored with it
  if (
    transferSecretRegister.success.is(action) &&
    action.payload.confirmed &&
    action.payload.txBlock !== transferState.secretRegistered?.txBlock &&
    action.payload.txBlock < transferState.expiration
  )
    state = {
      ...state,
      transfers: {
        ...state.transfers,
        [key]: {
          ...transferState,
          secretRegistered: timed(pick(['txHash', 'txBlock'], action.payload)),
        },
      },
    };
  return state;
}

function transferEnvelopeReducer(
  state: RaidenState,
  action: transferSigned | transferExpire.success | transferUnlock.success,
): RaidenState {
  const message = action.payload.message;
  const secrethash = action.meta.secrethash;
  const tKey = transferKey(action.meta);
  const tokenNetwork = message.token_network_address;
  const partner = action.payload.partner;
  const cKey = channelKey({ tokenNetwork, partner });
  const end = END[action.meta.direction];
  let channel = state.channels[cKey];

  const isTransferPresent = tKey in state.transfers;
  const field = transferUnlock.success.is(action) ? 'unlock' : 'expired';
  // nonce must be next, otherwise we already processed this message; validation happens on epic
  if (
    (transferSigned.is(action) && isTransferPresent) ||
    (!transferSigned.is(action) && (!isTransferPresent || field in state.transfers[tKey])) ||
    channel?.state !== ChannelState.open ||
    !message.nonce.eq(channel[end].nextNonce)
  )
    return state;

  let locks;
  let transferState;
  switch (action.type) {
    case transferSigned.type:
      locks = [...channel[end].locks, action.payload.message.lock]; // append lock
      transferState = {
        _id: tKey,
        channel: channelUniqueKey(channel),
        ...action.meta,
        transfer: timed(action.payload.message),
        fee: action.payload.fee,
        expiration: action.payload.message.lock.expiration.toNumber(),
        partner,
        cleared: 0,
      }; // initialize transfer state on transferSigned
      break;
    case transferUnlock.success.type:
    case transferExpire.success.type:
      locks = channel[end].locks.filter((l) => l.secrethash !== secrethash); // pop lock
      transferState = {
        [field]: timed(action.payload.message),
        ...state.transfers[tKey], // don't overwrite previous [field]
      }; // set unlock or expired members on existing tranferState
      break;
  } // switch without default helps secure against incomplete casing

  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      locks,
      // set current/latest channel[end].balanceProof
      balanceProof: getBalanceProofFromEnvelopeMessage(message),
      nextNonce: channel[end].nextNonce.add(1) as UInt<8>, // always increment nextNonce
    },
  };

  // both transfer's and channel end's state changes done atomically
  return {
    ...state,
    channels: { ...state.channels, [cKey]: channel },
    transfers: {
      ...state.transfers,
      [tKey]: transferState,
    },
  };
}

const fieldMap = {
  [transferSecretRequest.type]: 'secretRequest',
  [transferSecretReveal.type]: 'secretReveal',
  [transferProcessed.type]: 'transferProcessed',
  [transferUnlockProcessed.type]: 'unlockProcessed',
  [transferExpireProcessed.type]: 'expiredProcessed',
} as const;

function transferMessagesReducer(
  state: RaidenState,
  action:
    | transferSecretRequest
    | transferSecretReveal
    | transferProcessed
    | transferUnlockProcessed
    | transferExpireProcessed,
) {
  const key = transferKey(action.meta);
  const field = fieldMap[action.type];
  if (
    key in state.transfers &&
    (transferSecretRequest.is(action) || !(field in state.transfers[key]))
  )
    state = {
      ...state,
      transfers: {
        ...state.transfers,
        [key]: {
          ...state.transfers[key],
          [field]: timed(action.payload.message),
        },
      },
    };
  return state;
}

function transferClearReducer(state: RaidenState, action: transferClear): RaidenState {
  const key = transferKey(action.meta);
  if (key in state.transfers) {
    const { [key]: _cleared, ...transfers } = state.transfers;
    state = { ...state, transfers };
  }
  return state;
}

function transferLoadReducer(state: RaidenState, action: transferLoad): RaidenState {
  const key = transferKey(action.meta);
  if (!(key in state.transfers))
    state = {
      ...state,
      transfers: {
        ...state.transfers,
        [key]: { ...action.payload, cleared: 0 },
      },
    };
  return state;
}

function channelCloseSettleReducer(
  state: RaidenState,
  action: channelClose.success | channelSettle.success,
): RaidenState {
  if (!action.payload.confirmed) return state;
  const field = channelClose.success.is(action) ? 'channelClosed' : 'channelSettled';
  const channel = channelUniqueKey({ id: action.payload.id, ...action.meta });
  for (const transferState of Object.values(state.transfers)) {
    if (transferState.channel !== channel) continue;
    state = {
      ...state,
      transfers: {
        ...state.transfers,
        [transferKey(transferState)]: {
          ...transferState,
          [field]: timed(pick(['txHash', 'txBlock'], action.payload)),
        },
      },
    };
  }
  return state;
}

function withdrawReducer(
  state: RaidenState,
  action: withdrawMessage.request | withdrawMessage.success | withdrawExpire.success,
): RaidenState {
  const message = action.payload.message;
  const key = channelKey(action.meta);
  let channel = state.channels[key];

  // messages always update sender's nonce, i.e. requestee's for confirmations, else requester's
  const senderEnd =
    (action.meta.direction === Direction.RECEIVED) !== withdrawMessage.success.is(action)
      ? 'partner'
      : 'own';
  // nonce must be next, otherwise already processed message, skip
  if (channel?.state !== ChannelState.open || !message.nonce.eq(channel[senderEnd].nextNonce))
    return state;
  channel = {
    ...channel,
    [senderEnd]: {
      ...channel[senderEnd],
      nextNonce: channel[senderEnd].nextNonce.add(1) as UInt<8>, // no BP, but increment nextNonce
    },
  };

  // all messages are stored in 'pendingWithdraws' array on requester's/withdrawer's side
  const withdrawerEnd = action.meta.direction === Direction.RECEIVED ? 'partner' : 'own';
  const pendingWithdraws = [...channel[withdrawerEnd].pendingWithdraws, action.payload.message];
  // senderEnd == withdrawerEnd for request & expiration, and the other for confirmation
  channel = {
    ...channel,
    [withdrawerEnd]: {
      ...channel[withdrawerEnd],
      pendingWithdraws,
    },
  };

  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function withdrawCompletedReducer(state: RaidenState, action: withdrawCompleted): RaidenState {
  const key = channelKey(action.meta);
  let channel = state.channels[key];
  if (channel?.state !== ChannelState.open) return state;

  const end = action.meta.direction === Direction.RECEIVED ? 'partner' : 'own';
  // filters out all withdraw messages matching meta
  const pendingWithdraws = channel[end].pendingWithdraws.filter(
    (req) =>
      !req.expiration.eq(action.meta.expiration) ||
      !req.total_withdraw.eq(action.meta.totalWithdraw),
  );
  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      pendingWithdraws,
    },
  };
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

/**
 * Handles all transfers actions and requests
 */
const transfersReducer: Reducer<RaidenState, RaidenAction> = createReducer(initialState)
  .handle([transferSecret, transferSecretRegister.success], transferSecretReducer)
  .handle(
    [transferSigned, transferUnlock.success, transferExpire.success],
    transferEnvelopeReducer,
  )
  .handle(
    [
      transferProcessed,
      transferUnlockProcessed,
      transferExpireProcessed,
      transferSecretRequest,
      transferSecretReveal,
    ],
    transferMessagesReducer,
  )
  .handle(transferClear, transferClearReducer)
  .handle(transferLoad, transferLoadReducer)
  .handle([channelClose.success, channelSettle.success], channelCloseSettleReducer)
  .handle(
    [withdrawMessage.request, withdrawMessage.success, withdrawExpire.success],
    withdrawReducer,
  )
  .handle(withdrawCompleted, withdrawCompletedReducer);

export default transfersReducer;
