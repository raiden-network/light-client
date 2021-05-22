/* eslint-disable @typescript-eslint/no-namespace */
import * as t from 'io-ts';

import { BalanceProof } from '../channels/types';
import {
  LockedTransfer,
  LockExpired,
  Metadata,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
  WithdrawConfirmation,
  WithdrawExpired,
  WithdrawRequest,
} from '../messages/types';
import { Via } from '../transport/types';
import type { ActionType } from '../utils/actions';
import { createAction, createAsyncAction } from '../utils/actions';
import { Address, Hash, Int, Secret, Signed, UInt } from '../utils/types';
import { DirectionC, TransferState } from './state';

const TransferId = t.type({
  secrethash: Hash,
  direction: DirectionC,
});

/**
 * A transfer async action set
 *
 * A transfer is considered as having succeeded from the time the secret is revealed to the target,
 * as from there, target and mediators can claim the payment down to us. But the full off-chain
 * happy case completes only after partner/neighbor acknowledges receiving the Unlock.
 * So, we usually only emits this action in the end of the happy case, and it'll then contain the
 * unlock's balanceProof, which indicates the full off-chain path succeeded.
 * It'll be emitted without a balanceProof if something forces the transfer to complete
 * (e.g.  channel closed), the secret was revealed (so target was paid) but for any reason the
 * unlock didn't happen yet.
 *
 * transfer.failure is emitted as soon as we know the transfer failed definitely, like when a
 * RefundTransfer is received or the lock expires before revealing the secret. It notifies the user
 * (e.g. pending Promises) that the transfer failed and won't be paid (eventually, locked amount
 * will be recovered by expiring the lock).
 */
export const transfer = createAsyncAction(
  TransferId,
  'transfer/request',
  'transfer/success',
  'transfer/failure',
  t.intersection([
    t.type({
      tokenNetwork: Address,
      target: Address,
      value: UInt(32),
      paymentId: UInt(8),
      metadata: Metadata,
      fee: Int(32),
      partner: Address,
    }),
    Via,
    t.partial({
      secret: Secret,
      expiration: t.number,
      initiator: Address,
    }),
  ]),
  t.partial({ balanceProof: Signed(BalanceProof) }),
);

export namespace transfer {
  export interface request extends ActionType<typeof transfer.request> {}
  export interface success extends ActionType<typeof transfer.success> {}
  export interface failure extends ActionType<typeof transfer.failure> {}
}

/** A LockedTransfer was signed and should be sent to partner */
export const transferSigned = createAction(
  'transfer/signed',
  t.intersection([
    t.type({ message: Signed(LockedTransfer), fee: Int(32), partner: Address }),
    Via,
  ]),
  TransferId,
);
export interface transferSigned extends ActionType<typeof transferSigned> {}

/** Partner acknowledge they received and processed our LockedTransfer */
export const transferProcessed = createAction(
  'transfer/processed',
  t.intersection([t.type({ message: Signed(Processed) }), Via]),
  TransferId,
);
export interface transferProcessed extends ActionType<typeof transferProcessed> {}

/** Register a secret */
export const transferSecret = createAction(
  'transfer/secret',
  t.type({ secret: Secret }),
  TransferId,
);
export interface transferSecret extends ActionType<typeof transferSecret> {}

export const transferSecretRegister = createAsyncAction(
  TransferId,
  'transfer/secret/register/request',
  'transfer/secret/register/success',
  'transfer/secret/register/failure',
  t.intersection([t.type({ secret: Secret }), t.partial({ subkey: t.boolean })]),
  t.type({
    secret: Secret,
    txHash: Hash,
    txBlock: t.number,
    // ConfirmableAction
    confirmed: t.union([t.undefined, t.boolean]),
  }),
);

export namespace transferSecretRegister {
  export interface request extends ActionType<typeof transferSecretRegister.request> {}
  export interface success extends ActionType<typeof transferSecretRegister.success> {}
  export interface failure extends ActionType<typeof transferSecretRegister.failure> {}
}

/** A valid SecretRequest received from target */
export const transferSecretRequest = createAction(
  'transfer/secret/request',
  t.intersection([t.type({ message: Signed(SecretRequest) }), Via]),
  TransferId,
);
export interface transferSecretRequest extends ActionType<typeof transferSecretRequest> {}

/** A SecretReveal sent to target */
export const transferSecretReveal = createAction(
  'transfer/secret/reveal',
  t.intersection([t.type({ message: Signed(SecretReveal) }), Via]),
  TransferId,
);
export interface transferSecretReveal extends ActionType<typeof transferSecretReveal> {}

export const transferUnlock = createAsyncAction(
  TransferId,
  'transfer/unlock/request',
  'transfer/unlock/success',
  'transfer/unlock/failure',
  t.union([t.undefined, Via]),
  t.intersection([t.type({ message: Signed(Unlock), partner: Address }), Via]),
);

export namespace transferUnlock {
  export interface request extends ActionType<typeof transferUnlock.request> {}
  export interface success extends ActionType<typeof transferUnlock.success> {}
  export interface failure extends ActionType<typeof transferUnlock.failure> {}
}

/** Partner acknowledge they received and processed our Unlock */
export const transferUnlockProcessed = createAction(
  'transfer/unlock/processed',
  t.intersection([t.type({ message: Signed(Processed) }), Via]),
  TransferId,
);
export interface transferUnlockProcessed extends ActionType<typeof transferUnlockProcessed> {}

/**
 * A request to expire a given transfer
 *
 * A transfer expiration request may fail for any reason
 * e.g. user rejected sign prompt. It should eventually get prompted again, on a future newBlock
 * action which sees this transfer should be expired but sent.expired didn't get set yet.
 */
export const transferExpire = createAsyncAction(
  TransferId,
  'transfer/expire/request',
  'transfer/expire/success',
  'transfer/expire/failure',
  undefined,
  t.type({ message: Signed(LockExpired), partner: Address }),
);

export namespace transferExpire {
  export interface request extends ActionType<typeof transferExpire.request> {}
  export interface success extends ActionType<typeof transferExpire.success> {}
  export interface failure extends ActionType<typeof transferExpire.failure> {}
}

/** Partner acknowledge they received and processed our LockExpired */
export const transferExpireProcessed = createAction(
  'transfer/expire/processed',
  t.intersection([t.type({ message: Signed(Processed) }), Via]),
  TransferId,
);
export interface transferExpireProcessed extends ActionType<typeof transferExpireProcessed> {}

export const transferClear = createAction('transfer/clear', t.undefined, TransferId);
export interface transferClear extends ActionType<typeof transferClear> {}

export const transferLoad = createAction('transfer/load', TransferState, TransferId);
export interface transferLoad extends ActionType<typeof transferLoad> {}

// Withdraw actions

const WithdrawId = t.type({
  direction: DirectionC,
  tokenNetwork: Address,
  partner: Address,
  totalWithdraw: UInt(32),
  expiration: t.number,
});

/**
 * Start a withdraw
 * - request: request to start a withdraw
 * - success: withdraw finished on-chain
 * - failure: something went wrong generating or processing a request
 */
export const withdraw = createAsyncAction(
  WithdrawId,
  'withdraw/request',
  'withdraw/success',
  'withdraw/failure',
  t.undefined,
  t.type({ txHash: Hash, txBlock: t.number, confirmed: t.union([t.undefined, t.boolean]) }),
);
export namespace withdraw {
  export interface request extends ActionType<typeof withdraw.request> {}
  export interface success extends ActionType<typeof withdraw.success> {}
  export interface failure extends ActionType<typeof withdraw.failure> {}
}

/**
 * Withdraw messages going through:
 * - request: WithdrawRequest sent or received
 * - success: WithdrawConfirmation sent or received
 * - failure: something went wrong processing WithdrawRequest or WithdrawConfirmation messages
 */
export const withdrawMessage = createAsyncAction(
  WithdrawId,
  'withdraw/message/request',
  'withdraw/message/success',
  'withdraw/message/failure',
  t.type({ message: Signed(WithdrawRequest) }),
  t.type({ message: Signed(WithdrawConfirmation) }),
);
export namespace withdrawMessage {
  export interface request extends ActionType<typeof withdrawMessage.request> {}
  export interface success extends ActionType<typeof withdrawMessage.success> {}
  export interface failure extends ActionType<typeof withdrawMessage.failure> {}
}

/**
 * Expires a withdraw
 * - request: request to expire a past request
 * - success: WithdrawExpired sent or received
 * - failure: something went wrong generating or processing a request
 */
export const withdrawExpire = createAsyncAction(
  WithdrawId,
  'withdraw/expire/request',
  'withdraw/expire/success',
  'withdraw/expire/failure',
  t.undefined,
  t.type({ message: Signed(WithdrawExpired) }),
  // ,
);
export namespace withdrawExpire {
  export interface request extends ActionType<typeof withdrawExpire.request> {}
  export interface success extends ActionType<typeof withdrawExpire.success> {}
  export interface failure extends ActionType<typeof withdrawExpire.failure> {}
}

export const withdrawCompleted = createAction('withdraw/completed', t.undefined, WithdrawId);
export interface withdrawCompleted extends ActionType<typeof withdrawCompleted> {}
