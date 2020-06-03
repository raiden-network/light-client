import unset from 'lodash/fp/unset';

import { channelKey } from '../channels/utils';
import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { ChannelState } from '../channels/state';
import { channelClose } from '../channels/actions';
import { timed } from '../utils/types';
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

  // nonce must be next, otherwise we already processed this message
  // rest of validation happens on epic
  if (
    transferSigned.is(action) === secrethash in state[action.meta.direction] ||
    channel?.state !== ChannelState.open ||
    !message.nonce.eq(channel[end].balanceProof.nonce.add(1))
  )
    return state;

  const [locks, transfer] = transferSigned.is(action)
    ? [
        [...channel[end].locks, action.payload.message.lock], // append lock
        {
          transfer: timed(action.payload.message),
          fee: action.payload.fee,
          partner,
        }, // initialize transfer state
      ]
    : [
        channel[end].locks.filter((l) => l.secrethash !== secrethash), // pop lock
        {
          ...state[action.meta.direction][secrethash],
          [transferUnlock.success.is(action) ? 'unlock' : 'lockExpired']: timed(
            action.payload.message,
          ),
        }, // set unlock or lockExpired members
      ];
  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      locks,
      // set current/latest channel[end].balanceProof
      balanceProof: getBalanceProofFromEnvelopeMessage(message),
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

function withdrawReceiveSuccessReducer(
  state: RaidenState,
  action: withdrawReceive.success,
): RaidenState {
  // TODO: subtract this pending withdraw request from partner's capacity (maybe some pending
  // withdraws state), revert upon expiration or consolidate on confirmed channelWithdrawn
  const message = action.payload.message;
  const key = channelKey(action.meta);
  let channel = state.channels[key];
  if (!channel || channel.state !== ChannelState.open) return state;
  // current own balanceProof, or zero balance proof, with some known fields filled
  const balanceProof = channel.own.balanceProof;
  // if it's the next nonce, update balance proof
  if (message.nonce.eq(balanceProof.nonce.add(1)) && message.expiration.gt(state.blockNumber)) {
    channel = {
      ...channel,
      own: {
        ...channel.own,
        balanceProof: {
          ...balanceProof,
          nonce: message.nonce,
        },
      },
    };
    state = { ...state, channels: { ...state.channels, [key]: channel } };
  }
  return state;
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
  .handle(withdrawReceive.success, withdrawReceiveSuccessReducer);
export default transfersReducer;
