import { get, set, unset, mapValues } from 'lodash/fp';
import { Zero, HashZero } from 'ethers/constants';
import { hexlify } from 'ethers/utils';

import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { Channel, ChannelState } from '../channels/state';
import { SignedBalanceProof } from '../channels/types';
import { channelClose } from '../channels/actions';
import { getLocksroot } from './utils';
import { SignatureZero } from '../constants';
import { timed, UInt, Signature, Hash } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { SentTransfer } from './state';
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
} from './actions';

// Reducers for different actions
function transferSecretReducer(state: RaidenState, action: transferSecret): RaidenState {
  const secrethash = action.meta.secrethash;
  if (secrethash in state.secrets && state.secrets[secrethash].registerBlock) return state; // avoid storing without registerBlock if we already got with
  return {
    ...state,
    secrets: {
      ...state.secrets,
      [secrethash]: action.payload,
    },
  };
}

function transferSignedReducer(state: RaidenState, action: transferSigned): RaidenState {
  const transfer = action.payload.message;
  const lock = transfer.lock;
  const secrethash = lock.secrethash;
  // transferSigned must be the first action, to init SentTransfer state
  if (secrethash in state.sent) return state;
  const channelPath = ['channels', transfer.token_network_address, transfer.recipient];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel) return state;

  const locks = [...(channel.own.locks || []), lock]; // append lock
  const locksroot = getLocksroot(locks);
  if (
    transfer.locksroot !== locksroot ||
    !transfer.nonce.eq(
      (channel.own.balanceProof ? channel.own.balanceProof.nonce : Zero).add(1),
    ) || // nonce must be next
    !transfer.transferred_amount.eq(
      channel.own.balanceProof ? channel.own.balanceProof.transferredAmount : Zero,
    ) ||
    !transfer.locked_amount.eq(
      (channel.own.balanceProof ? channel.own.balanceProof.lockedAmount : Zero).add(lock.amount),
    )
  )
    return state;

  channel = {
    ...channel,
    own: {
      ...channel.own,
      locks,
      // set current/latest channel.own.balanceProof to LockedTransfer's
      balanceProof: getBalanceProofFromEnvelopeMessage(transfer),
    },
  };
  const sentTransfer: SentTransfer = { transfer: timed(transfer), fee: action.payload.fee };

  state = set(channelPath, channel, state);
  state = set(['sent', secrethash], sentTransfer, state);
  return state;
}

function transferProcessedReducer(state: RaidenState, action: transferProcessed): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
        transferProcessed: timed(action.payload.message),
      },
    },
  };
}

function transferSecretReveledReducer(
  state: RaidenState,
  action: transferSecretReveal,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent) || state.sent[secrethash].secretReveal) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
        secretReveal: timed(action.payload.message),
      },
    },
  };
}

function transferUnlockSuccessReducer(
  state: RaidenState,
  action: transferUnlock.success,
): RaidenState {
  const unlock = action.payload.message;
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent) || state.sent[secrethash].unlock) return state;
  const transfer = state.sent[secrethash].transfer[1];
  const lock = transfer.lock;
  const channelPath = ['channels', transfer.token_network_address, transfer.recipient];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel || !channel.own.locks || !channel.own.balanceProof) return state;

  const locks = channel.own.locks.filter(l => l.secrethash !== secrethash);
  const locksroot = getLocksroot(locks);
  if (
    unlock.locksroot !== locksroot ||
    !channel.own.balanceProof.nonce.add(1).eq(unlock.nonce) || // nonce must be next
    !unlock.transferred_amount.eq(channel.own.balanceProof.transferredAmount.add(lock.amount)) ||
    !unlock.locked_amount.eq(channel.own.balanceProof.lockedAmount.sub(lock.amount))
  )
    return state;

  channel = {
    ...channel,
    own: {
      ...channel.own,
      locks, // pop lock
      // set current/latest channel.own.balanceProof to Unlock's
      balanceProof: getBalanceProofFromEnvelopeMessage(unlock),
    },
  };
  const sentTransfer: SentTransfer = { ...state.sent[secrethash], unlock: timed(unlock) };

  state = set(channelPath, channel, state);
  state = set(['sent', secrethash], sentTransfer, state);
  return state;
}

function transferExpireSuccessReducer(
  state: RaidenState,
  action: transferExpire.success,
): RaidenState {
  const lockExpired = action.payload.message;
  const secrethash = action.meta.secrethash;
  if (
    !(secrethash in state.sent) ||
    state.sent[secrethash].unlock || // don't accept expire if already unlocked
    state.sent[secrethash].lockExpired // already expired
  )
    return state;
  const transfer = state.sent[secrethash].transfer[1];
  const lock = transfer.lock;
  const channelPath = ['channels', transfer.token_network_address, transfer.recipient];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel || !channel.own.locks || !channel.own.balanceProof) return state;

  const locks = channel.own.locks.filter(l => l.secrethash !== secrethash);
  const locksroot = getLocksroot(locks);
  if (
    lockExpired.locksroot !== locksroot ||
    !channel.own.balanceProof.nonce.add(1).eq(lockExpired.nonce) || // nonce must be next
    !lockExpired.transferred_amount.eq(channel.own.balanceProof.transferredAmount) ||
    !lockExpired.locked_amount.eq(channel.own.balanceProof.lockedAmount.sub(lock.amount))
  )
    return state;

  channel = {
    ...channel,
    own: {
      ...channel.own,
      locks, // pop lock
      // set current/latest channel.own.balanceProof to LockExpired's
      balanceProof: getBalanceProofFromEnvelopeMessage(lockExpired),
    },
  };
  const sentTransfer: SentTransfer = {
    ...state.sent[secrethash],
    lockExpired: timed(lockExpired),
  };

  state = set(channelPath, channel, state);
  state = set(['sent', secrethash], sentTransfer, state);
  return state;
}

function transferUnlockProcessedReducer(
  state: RaidenState,
  action: transferUnlockProcessed,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
        unlockProcessed: timed(action.payload.message),
      },
    },
  };
}

function transferExpireProcessedReducer(
  state: RaidenState,
  action: transferExpireProcessed,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
        lockExpiredProcessed: timed(action.payload.message),
      },
    },
  };
}

function transferRefundedReducer(state: RaidenState, action: transferRefunded): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
        refund: timed(action.payload.message),
      },
    },
  };
}

function closeSuccessReducer(state: RaidenState, action: channelClose.success): RaidenState {
  return {
    ...state,
    sent: mapValues(
      (v: SentTransfer): SentTransfer =>
        // if transfer was on this channel, persist CloseChannel txHash, else pass
        v.transfer[1].channel_identifier.eq(action.payload.id) &&
        v.transfer[1].recipient === action.meta.partner &&
        v.transfer[1].token_network_address === action.meta.tokenNetwork
          ? { ...v, channelClosed: timed(action.payload.txHash) }
          : v,
    )(state.sent),
  };
}

function transferClearReducer(state: RaidenState, action: transferClear): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  state = unset(['sent', secrethash], state);
  state = unset(['secrets', secrethash], state);
  return state;
}

function withdrawReceiveSuccessReducer(
  state: RaidenState,
  action: withdrawReceive.success,
): RaidenState {
  const message = action.payload.message;
  const channelPath = ['channels', action.meta.tokenNetwork, action.meta.partner];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel || channel.state !== ChannelState.open) return state;
  // current own balanceProof, or zero balance proof, with some known fields filled
  const balanceProof: SignedBalanceProof = channel.own.balanceProof || {
    chainId: message.chain_id,
    tokenNetworkAddress: action.meta.tokenNetwork,
    channelId: message.channel_identifier,
    // balance proof data
    nonce: Zero as UInt<8>,
    transferredAmount: Zero as UInt<32>,
    lockedAmount: Zero as UInt<32>,
    locksroot: HashZero as Hash,
    messageHash: HashZero as Hash,
    signature: hexlify(SignatureZero) as Signature,
    sender: state.address,
  };
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
    state = set(channelPath, channel, state);
  }
  return state;
}

/**
 * Handles all transfers actions and requests
 *
 * @param state - Current RaidenState
 * @param action - RaidenAction to handle
 * @returns New RaidenState (or current, if action didn't change anything)
 */
export function transfersReducer(
  state: RaidenState = initialState,
  action: RaidenAction,
): RaidenState {
  if (isActionOf(transferSecret, action)) {
    return transferSecretReducer(state, action);
  } else if (isActionOf(transferSigned, action)) {
    return transferSignedReducer(state, action);
  } else if (isActionOf(transferProcessed, action)) {
    return transferProcessedReducer(state, action);
  } else if (isActionOf(transferSecretReveal, action)) {
    return transferSecretReveledReducer(state, action);
  } else if (isActionOf(transferUnlock.success, action)) {
    return transferUnlockSuccessReducer(state, action);
  } else if (isActionOf(transferExpire.success, action)) {
    return transferExpireSuccessReducer(state, action);
  } else if (isActionOf(transferUnlockProcessed, action)) {
    return transferUnlockProcessedReducer(state, action);
  } else if (isActionOf(transferExpireProcessed, action)) {
    return transferExpireProcessedReducer(state, action);
  } else if (isActionOf(transferRefunded, action)) {
    return transferRefundedReducer(state, action);
  } else if (isActionOf(channelClose.success, action)) {
    return closeSuccessReducer(state, action);
  } else if (isActionOf(transferClear, action)) {
    return transferClearReducer(state, action);
  } else if (isActionOf(withdrawReceive.success, action)) {
    return withdrawReceiveSuccessReducer(state, action);
  } else return state;
}
