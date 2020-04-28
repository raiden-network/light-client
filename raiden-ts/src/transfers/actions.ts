/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { Address, UInt, Int, Secret, Hash, Signed } from '../utils/types';
import { createAction, ActionType, createAsyncAction } from '../utils/actions';
import { SignedBalanceProof } from '../channels/types';
import {
  LockedTransfer,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
  LockExpired,
  RefundTransfer,
  WithdrawRequest,
  WithdrawConfirmation,
} from '../messages/types';
import { Paths } from '../services/types';

const TransferId = t.type({
  secrethash: Hash,
  direction: t.keyof({ sent: null, received: null }),
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
      paths: Paths,
      paymentId: UInt(8),
    }),
    t.partial({
      secret: Secret,
      expiration: t.number,
      initiator: Address,
    }),
  ]),
  t.partial({ balanceProof: SignedBalanceProof }),
);

export namespace transfer {
  export interface request extends ActionType<typeof transfer.request> {}
  export interface success extends ActionType<typeof transfer.success> {}
  export interface failure extends ActionType<typeof transfer.failure> {}
}

/** A LockedTransfer was signed and should be sent to partner */
export const transferSigned = createAction(
  'transferSigned',
  t.type({ message: Signed(LockedTransfer), fee: Int(32) }),
  TransferId,
);
export interface transferSigned extends ActionType<typeof transferSigned> {}

/** Partner acknowledge they received and processed our LockedTransfer */
export const transferProcessed = createAction(
  'transferProcessed',
  t.type({ message: Signed(Processed) }),
  TransferId,
);
export interface transferProcessed extends ActionType<typeof transferProcessed> {}

/** Register a secret */
export const transferSecret = createAction(
  'transferSecret',
  t.type({ secret: Secret }),
  TransferId,
);
export interface transferSecret extends ActionType<typeof transferSecret> {}

export const transferSecretRegister = createAsyncAction(
  TransferId,
  'transferSecret/register/request',
  'transferSecret/register/success',
  'transferSecret/register/failure',
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
  'transferSecretRequest',
  t.type({ message: Signed(SecretRequest) }),
  TransferId,
);
export interface transferSecretRequest extends ActionType<typeof transferSecretRequest> {}

/** A SecretReveal sent to target */
export const transferSecretReveal = createAction(
  'transferSecretReveal',
  t.type({ message: Signed(SecretReveal) }),
  TransferId,
);
export interface transferSecretReveal extends ActionType<typeof transferSecretReveal> {}

export const transferUnlock = createAsyncAction(
  TransferId,
  'transfer/unlock/request',
  'transfer/unlock/success',
  'transfer/unlock/failure',
  undefined,
  t.type({ message: Signed(Unlock) }),
);

export namespace transferUnlock {
  export interface request extends ActionType<typeof transferUnlock.request> {}
  export interface success extends ActionType<typeof transferUnlock.success> {}
  export interface failure extends ActionType<typeof transferUnlock.failure> {}
}

/** Partner acknowledge they received and processed our Unlock */
export const transferUnlockProcessed = createAction(
  'transferUnlockProcessed',
  t.type({ message: Signed(Processed) }),
  TransferId,
);
export interface transferUnlockProcessed extends ActionType<typeof transferUnlockProcessed> {}

/**
 * A request to expire a given transfer
 *
 * A transfer expiration request may fail for any reason
 * e.g. user rejected sign promopt. It should eventually get prompted again, on a future newBlock
 * action which sees this transfer should be expired but sent.lockExpired didn't get set yet.
 */
export const transferExpire = createAsyncAction(
  TransferId,
  'transfer/expire/request',
  'transfer/expire/success',
  'transfer/expire/failure',
  undefined,
  t.type({ message: Signed(LockExpired) }),
);

export namespace transferExpire {
  export interface request extends ActionType<typeof transferExpire.request> {}
  export interface success extends ActionType<typeof transferExpire.success> {}
  export interface failure extends ActionType<typeof transferExpire.failure> {}
}

/** Partner acknowledge they received and processed our LockExpired */
export const transferExpireProcessed = createAction(
  'transferExpireProcessed',
  t.type({ message: Signed(Processed) }),
  TransferId,
);
export interface transferExpireProcessed extends ActionType<typeof transferExpireProcessed> {}

/** A transfer was refunded */
export const transferRefunded = createAction(
  'transferRefunded',
  t.type({ message: Signed(RefundTransfer) }),
  TransferId,
);
export interface transferRefunded extends ActionType<typeof transferRefunded> {}

/** A pending transfer isn't needed anymore and should be cleared from state */
export const transferClear = createAction('transferClear', undefined, TransferId);
export interface transferClear extends ActionType<typeof transferClear> {}

// Withdraw actions

const WithdrawId = t.type({
  tokenNetwork: Address,
  partner: Address,
  totalWithdraw: UInt(32),
  expiration: t.number,
});

/** A WithdrawRequest was received from partner */
export const withdrawReceive = createAsyncAction(
  WithdrawId,
  'withdraw/receive/request',
  'withdraw/receive/success',
  'withdraw/receive/failure',
  t.type({ message: Signed(WithdrawRequest) }),
  t.type({ message: Signed(WithdrawConfirmation) }),
);

export namespace withdrawReceive {
  export interface request extends ActionType<typeof withdrawReceive.request> {}
  export interface success extends ActionType<typeof withdrawReceive.success> {}
  export interface failure extends ActionType<typeof withdrawReceive.failure> {}
}
