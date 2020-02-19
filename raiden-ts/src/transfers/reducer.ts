import { Reducer } from 'redux';
import { get, set, unset } from 'lodash/fp';
import { Zero, HashZero } from 'ethers/constants';
import { hexlify } from 'ethers/utils';

import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { Channel, ChannelState } from '../channels/state';
import { SignedBalanceProof } from '../channels/types';
import { channelClose } from '../channels/actions';
import { SignatureZero } from '../constants';
import { timed, UInt, Signature, Hash } from '../utils/types';
import { createReducer } from '../utils/actions';
import { getBalanceProofFromEnvelopeMessage } from '../messages/utils';
import { getLocksroot } from './utils';
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
  transferSecretRequest,
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

function transferSecretRequestedReducer(
  state: RaidenState,
  action: transferSecretRequest,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
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

function transferStateReducer(
  state: RaidenState,
  action: transferProcessed | transferUnlockProcessed | transferExpireProcessed | transferRefunded,
): RaidenState {
  const secrethash = action.meta.secrethash;
  if (!(secrethash in state.sent)) return state;

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
  if (state.sent[secrethash][key]) return state;
  return {
    ...state,
    sent: {
      ...state.sent,
      [secrethash]: {
        ...state.sent[secrethash],
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
    const transfer = v.transfer[1];
    if (
      !transfer.channel_identifier.eq(action.payload.id) ||
      transfer.recipient !== action.meta.partner ||
      transfer.token_network_address !== action.meta.tokenNetwork
    )
      continue;
    sent = { ...sent, [secrethash]: { ...v, channelClosed: timed(action.payload.txHash) } };
  }
  if (sent === state.sent) return state;
  return { ...state, sent };
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
  // TODO: subtract this pending withdraw request from partner's capacity (maybe some pending
  // withdraws state), revert upon expiration or consolidate on confirmed channelWithdrawn
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
 */
export const transfersReducer: Reducer<RaidenState, RaidenAction> = createReducer(initialState)
  .handle(transferSecret, transferSecretReducer)
  .handle(transferSigned, transferSignedReducer)
  .handle(
    [transferProcessed, transferUnlockProcessed, transferExpireProcessed, transferRefunded],
    transferStateReducer,
  )
  .handle(transferSecretRequest, transferSecretRequestedReducer)
  .handle(transferSecretReveal, transferSecretReveledReducer)
  .handle(transferUnlock.success, transferUnlockSuccessReducer)
  .handle(transferExpire.success, transferExpireSuccessReducer)
  .handle(channelClose.success, channelCloseSuccessReducer)
  .handle(transferClear, transferClearReducer)
  .handle(withdrawReceive.success, withdrawReceiveSuccessReducer);
