import unset from 'lodash/fp/unset';

import { channelKey } from '../channels/utils';
import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { ChannelState } from '../channels/state';
import { channelClose } from '../channels/actions';
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
  transferRefunded,
  transferUnlockProcessed,
  transferExpireProcessed,
  transferClear,
  withdrawReceive,
  transferSecretRequest,
  transferSecretRegister,
  withdrawExpired,
} from './actions';

const END = { [Direction.SENT]: 'own', [Direction.RECEIVED]: 'partner' } as const;

// Reducers for different actions
function transferSecretReducer(
  state: RaidenState,
  action: transferSecret | transferSecretRegister.success,
): RaidenState {
  const secrethash = action.meta.secrethash;
  // store when seeing unconfirmed, but registerBlock only after confirmation
  const registerBlock =
    transferSecretRegister.success.is(action) && action.payload.confirmed
      ? action.payload.txBlock
      : state[action.meta.direction][secrethash]?.secret?.[1]?.registerBlock ?? 0;
  // don't overwrite registerBlock if secret already stored with it
  if (
    secrethash in state[action.meta.direction] &&
    state[action.meta.direction][secrethash].secret?.[1]?.registerBlock !== registerBlock
  )
    state = {
      ...state,
      [action.meta.direction]: {
        ...state[action.meta.direction],
        [secrethash]: {
          ...state[action.meta.direction][secrethash],
          secret: timed({ value: action.payload.secret, registerBlock }),
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
  const tokenNetwork = message.token_network_address;
  const partner = action.payload.partner;
  const key = channelKey({ tokenNetwork, partner });
  const end = END[action.meta.direction];
  let channel = state.channels[key];

  // nonce must be next, otherwise we already processed this message; validation happens on epic;
  // transferSigned messages must not be in state, other envelopes do (corresponding transfer)
  if (
    transferSigned.is(action) === secrethash in state[action.meta.direction] ||
    channel?.state !== ChannelState.open ||
    !message.nonce.eq(channel[end].nextNonce)
  )
    return state;

  const [locks, transfer] = transferSigned.is(action)
    ? [
        [...channel[end].locks, action.payload.message.lock], // append lock
        {
          transfer: timed(action.payload.message),
          fee: action.payload.fee,
          partner,
        }, // initialize transfer state on transferSigned
      ]
    : [
        channel[end].locks.filter((l) => l.secrethash !== secrethash), // pop lock
        {
          ...state[action.meta.direction][secrethash],
          [transferUnlock.success.is(action) ? 'unlock' : 'lockExpired']: timed(
            action.payload.message,
          ),
        }, // set unlock or lockExpired members on already present tranferState
      ];
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
    channels: { ...state.channels, [key]: channel },
    [action.meta.direction]: {
      ...state[action.meta.direction],
      [secrethash]: transfer,
    },
  };
}

function transferSecretRequestedReducer(
  state: RaidenState,
  action: transferSecretRequest,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state[action.meta.direction])) return state;
  return {
    ...state,
    [action.meta.direction]: {
      ...state[action.meta.direction],
      [secrethash]: {
        ...state[action.meta.direction][secrethash],
        secretRequest: timed(action.payload.message),
      },
    },
  };
}

function transferSecretReveledReducer(
  state: RaidenState,
  action: transferSecretReveal,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (
    !(secrethash in state[action.meta.direction]) ||
    state[action.meta.direction][secrethash].secretReveal
  )
    return state;
  return {
    ...state,
    [action.meta.direction]: {
      ...state[action.meta.direction],
      [secrethash]: {
        ...state[action.meta.direction][secrethash],
        secretReveal: timed(action.payload.message),
      },
    },
  };
}

function transferStateReducer(
  state: RaidenState,
  action: transferProcessed | transferUnlockProcessed | transferExpireProcessed | transferRefunded,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state[action.meta.direction])) return state;

  let key: 'transferProcessed' | 'unlockProcessed' | 'lockExpiredProcessed' | 'refund';
  if (transferProcessed.is(action)) {
    key = 'transferProcessed';
  } else if (transferUnlockProcessed.is(action)) {
    key = 'unlockProcessed';
  } else if (transferExpireProcessed.is(action)) {
    key = 'lockExpiredProcessed';
  } else if (transferRefunded.is(action)) {
    key = 'refund';
  } else {
    return state;
  }
  if (state[action.meta.direction][secrethash][key]) return state;
  return {
    ...state,
    [action.meta.direction]: {
      ...state[action.meta.direction],
      [secrethash]: {
        ...state[action.meta.direction][secrethash],
        [key]: timed(action.payload.message),
      },
    },
  };
}

function channelCloseSuccessReducer(
  state: RaidenState,
  action: channelClose.success,
): RaidenState {
  let sent = state.sent;
  for (const [secrethash, v] of Object.entries(sent)) {
    const locked = v.transfer[1];
    if (
      !locked.channel_identifier.eq(action.payload.id) ||
      locked.recipient !== action.meta.partner ||
      locked.token_network_address !== action.meta.tokenNetwork
    )
      continue;
    sent = { ...sent, [secrethash]: { ...v, channelClosed: timed(action.payload.txHash) } };
  }
  if (sent !== state.sent) state = { ...state, sent };

  let received = state.received;
  for (const [secrethash, v] of Object.entries(received)) {
    const locked = v.transfer[1];
    if (
      !locked.channel_identifier.eq(action.payload.id) ||
      locked.recipient !== action.meta.partner ||
      locked.token_network_address !== action.meta.tokenNetwork
    )
      continue;
    received = {
      ...received,
      [secrethash]: { ...v, channelClosed: timed(action.payload.txHash) },
    };
  }
  if (received !== state.received) state = { ...state, received };

  return state;
}

function transferClearReducer(state: RaidenState, action: transferClear): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state[action.meta.direction])) return state;
  state = unset([action.meta.direction, secrethash], state);
  return state;
}

function withdrawReducer(
  state: RaidenState,
  action: withdrawReceive.request | withdrawReceive.success | withdrawReceive.failure,
): RaidenState {
  const message = action.payload.message;
  const key = channelKey(action.meta);
  // if it's a confirmation, it goes on requestee's side, else, on requester's
  const end =
    (message.participant === action.meta.partner) !== withdrawReceive.success.is(action)
      ? 'partner'
      : 'own';
  let channel = state.channels[key];
  // nonce must be next, otherwise already processed message, skip
  if (channel?.state !== ChannelState.open || !message.nonce.eq(channel[end].nextNonce))
    return state;

  let withdrawRequests = channel[end].withdrawRequests;
  // append withraw request to channel end state's withdrawRequests array
  if (withdrawReceive.request.is(action))
    withdrawRequests = [...channel[end].withdrawRequests, action.payload.message];

  // confirmations and expirations don't mutate pending requests array, only nextNonce;
  // expiration is handled and pending request cleared on expiration block confirmation
  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      withdrawRequests,
      nextNonce: channel[end].nextNonce.add(1) as UInt<8>, // no BP, but increment nextNonce
    },
  };
  return { ...state, channels: { ...state.channels, [key]: channel } };
}

function withdrawExpiredReducer(state: RaidenState, action: withdrawExpired): RaidenState {
  const key = channelKey(action.meta);
  const end = action.payload.participant === action.meta.partner ? 'partner' : 'own';
  let channel = state.channels[key];
  if (channel?.state !== ChannelState.open) return state;

  const withdrawRequests = channel[end].withdrawRequests.filter(
    (req) =>
      !req.expiration.eq(action.meta.expiration) ||
      !req.total_withdraw.eq(action.meta.totalWithdraw),
  );
  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      withdrawRequests,
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
    [transferProcessed, transferUnlockProcessed, transferExpireProcessed, transferRefunded],
    transferStateReducer,
  )
  .handle(transferSecretRequest, transferSecretRequestedReducer)
  .handle(transferSecretReveal, transferSecretReveledReducer)
  .handle(channelClose.success, channelCloseSuccessReducer)
  .handle(transferClear, transferClearReducer)
  .handle(
    [withdrawReceive.request, withdrawReceive.success, withdrawReceive.failure],
    withdrawReducer,
  )
  .handle(withdrawExpired, withdrawExpiredReducer);
export default transfersReducer;
