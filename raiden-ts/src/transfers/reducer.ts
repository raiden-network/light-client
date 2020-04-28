import get from 'lodash/fp/get';
import set from 'lodash/fp/set';
import unset from 'lodash/fp/unset';
import { Zero, HashZero } from 'ethers/constants';
import { hexlify } from 'ethers/utils';

import { RaidenState, initialState } from '../state';
import { RaidenAction } from '../actions';
import { Channel, ChannelState } from '../channels/state';
import { SignedBalanceProof } from '../channels/types';
import { channelClose } from '../channels/actions';
import { SignatureZero } from '../constants';
import { timed, UInt, Signature, Hash } from '../utils/types';
import { Reducer, createReducer } from '../utils/actions';
import { getBalanceProofFromEnvelopeMessage, getMessageSigner } from '../messages/utils';
import { getLocksroot } from './utils';
import { TransferState, Direction } from './state';
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

function transferSignedReducer(state: RaidenState, action: transferSigned): RaidenState {
  const transfer = action.payload.message;
  const lock = transfer.lock;
  const secrethash = lock.secrethash;

  const partner =
    action.meta.direction === Direction.SENT ? transfer.recipient : getMessageSigner(transfer);
  const end = END[action.meta.direction];

  // transferSigned must be the first action, to init TransferState state
  if (secrethash in state[action.meta.direction]) return state;
  const channelPath = ['channels', transfer.token_network_address, partner];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel) return state;

  const locks = [...(channel[end].locks ?? []), lock]; // append lock
  const locksroot = getLocksroot(locks);
  if (
    transfer.locksroot !== locksroot ||
    // nonce must be next
    !transfer.nonce.eq(
      (channel[end].balanceProof ? channel[end].balanceProof!.nonce : Zero).add(1),
    ) ||
    !transfer.transferred_amount.eq(
      channel[end].balanceProof ? channel[end].balanceProof!.transferredAmount : Zero,
    ) ||
    !transfer.locked_amount.eq((channel[end].balanceProof?.lockedAmount ?? Zero).add(lock.amount))
  )
    return state;

  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      locks,
      // set current/latest channel[end].balanceProof to LockedTransfer's
      balanceProof: getBalanceProofFromEnvelopeMessage(transfer),
    },
  };
  const transferState: TransferState = {
    transfer: timed(transfer),
    fee: action.payload.fee,
    partner,
  };

  state = set(channelPath, channel, state);
  state = set([action.meta.direction, secrethash], transferState, state);
  return state;
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

function transferUnlockSuccessReducer(
  state: RaidenState,
  action: transferUnlock.success,
): RaidenState {
  const unlock = action.payload.message;
  const secrethash = action.meta.secrethash;
  if (
    !(secrethash in state[action.meta.direction]) ||
    state[action.meta.direction][secrethash].unlock
  )
    return state;
  const transfer = state[action.meta.direction][secrethash].transfer[1];

  const partner = state[action.meta.direction][secrethash].partner;
  const end = END[action.meta.direction];

  const lock = transfer.lock;
  const channelPath = ['channels', transfer.token_network_address, partner];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel || !channel[end].locks || !channel[end].balanceProof) return state;

  const locks = channel[end].locks!.filter((l) => l.secrethash !== secrethash);
  const locksroot = getLocksroot(locks);
  if (
    unlock.locksroot !== locksroot ||
    !channel[end].balanceProof!.nonce.add(1).eq(unlock.nonce) || // nonce must be next
    !unlock.transferred_amount.eq(channel[end].balanceProof!.transferredAmount.add(lock.amount)) ||
    !unlock.locked_amount.eq(channel[end].balanceProof!.lockedAmount.sub(lock.amount))
  )
    return state;

  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      locks, // pop lock
      // set current/latest channel[end].balanceProof to Unlock's
      balanceProof: getBalanceProofFromEnvelopeMessage(unlock),
    },
  };
  const transferState: TransferState = {
    ...state[action.meta.direction][secrethash],
    unlock: timed(unlock),
  };

  state = set(channelPath, channel, state);
  state = set([action.meta.direction, secrethash], transferState, state);
  return state;
}

function transferExpireSuccessReducer(
  state: RaidenState,
  action: transferExpire.success,
): RaidenState {
  const expired = action.payload.message;
  const secrethash = action.meta.secrethash;
  if (
    !(secrethash in state[action.meta.direction]) ||
    state[action.meta.direction][secrethash].unlock || // don't accept expire if already unlocked
    state[action.meta.direction][secrethash].lockExpired // already expired
  )
    return state;
  const transfer = state[action.meta.direction][secrethash].transfer[1];

  const partner = state[action.meta.direction][secrethash].partner;
  const end = END[action.meta.direction];

  const lock = transfer.lock;
  const channelPath = ['channels', transfer.token_network_address, partner];
  let channel: Channel | undefined = get(channelPath, state);
  if (!channel || !channel[end].locks || !channel[end].balanceProof) return state;

  const locks = channel[end].locks!.filter((l) => l.secrethash !== secrethash);
  const locksroot = getLocksroot(locks);
  if (
    expired.locksroot !== locksroot ||
    !channel[end].balanceProof!.nonce.add(1).eq(expired.nonce) || // nonce must be next
    !expired.transferred_amount.eq(channel[end].balanceProof!.transferredAmount) ||
    !expired.locked_amount.eq(channel[end].balanceProof!.lockedAmount.sub(lock.amount))
  )
    return state;

  channel = {
    ...channel,
    [end]: {
      ...channel[end],
      locks, // pop lock
      // set current/latest channel[end].balanceProof to LockExpired's
      balanceProof: getBalanceProofFromEnvelopeMessage(expired),
    },
  };
  const transferState: TransferState = {
    ...state[action.meta.direction][secrethash],
    lockExpired: timed(expired),
  };

  state = set(channelPath, channel, state);
  state = set([action.meta.direction, secrethash], transferState, state);
  return state;
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
    const transfer = v.transfer[1];
    if (
      !transfer.channel_identifier.eq(action.payload.id) ||
      transfer.recipient !== action.meta.partner ||
      transfer.token_network_address !== action.meta.tokenNetwork
    )
      continue;
    sent = { ...sent, [secrethash]: { ...v, channelClosed: timed(action.payload.txHash) } };
  }
  if (sent !== state.sent) state = { ...state, sent };

  let received = state.received;
  for (const [secrethash, v] of Object.entries(received)) {
    const transfer = v.transfer[1];
    if (
      !transfer.channel_identifier.eq(action.payload.id) ||
      transfer.recipient !== action.meta.partner ||
      transfer.token_network_address !== action.meta.tokenNetwork
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
const transfersReducer: Reducer<RaidenState, RaidenAction> = createReducer(initialState)
  .handle([transferSecret, transferSecretRegister.success], transferSecretReducer)
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
export default transfersReducer;
