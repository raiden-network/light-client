/* eslint-disable @typescript-eslint/class-name-casing */
import * as t from 'io-ts';

import { Address, UInt, Int, Secret, Hash, Signed, ErrorCodec } from '../utils/types';
import { createAction, ActionType } from '../utils/actions';
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
import { Paths } from '../path/types';

const TransferId = t.type({ secrethash: Hash });

/** A request to initiate a transfer */
export const transfer = createAction(
  'transfer',
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
    }),
  ]),
  TransferId,
);
export interface transfer extends ActionType<typeof transfer> {}

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
  t.intersection([t.type({ secret: Secret }), t.partial({ registerBlock: t.number })]),
  TransferId,
);
export interface transferSecret extends ActionType<typeof transferSecret> {}

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

/** Unlock request after partner also revealed they know the secret */
export const transferUnlock = createAction('transferUnlock', undefined, TransferId);
export interface transferUnlock extends ActionType<typeof transferUnlock> {}

/** Signed Unlock to be sent to partner */
export const transferUnlocked = createAction(
  'transferUnlocked',
  t.type({ message: Signed(Unlock) }),
  TransferId,
);
export interface transferUnlocked extends ActionType<typeof transferUnlocked> {}

/** Partner acknowledge they received and processed our Unlock */
export const transferUnlockProcessed = createAction(
  'transferUnlockProcessed',
  t.type({ message: Signed(Processed) }),
  TransferId,
);
export interface transferUnlockProcessed extends ActionType<typeof transferUnlockProcessed> {}

/** A request to expire a given transfer */
export const transferExpire = createAction('transferExpire', undefined, TransferId);
export interface transferExpire extends ActionType<typeof transferExpire> {}

/** A transfer LockExpired message/BalanceProof successfuly generated */
export const transferExpired = createAction(
  'transferExpired',
  t.type({ message: Signed(LockExpired) }),
  TransferId,
);
export interface transferExpired extends ActionType<typeof transferExpired> {}

/**
 * A transfer expiration request failed for any reason
 * e.g. user rejected sign promopt. It should eventually get prompted again, on a future newBlock
 * action which sees this transfer should be expired but sent.lockExpired didn't get set yet.
 */
export const transferExpireFailed = createAction(
  'transferExpireFailed',
  ErrorCodec,
  TransferId,
  true,
);
export interface transferExpireFailed extends ActionType<typeof transferExpireFailed> {}

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

/**
 * A transfer completed successfuly
 *
 * A transfer is considered as having succeeded from the time the secret is revealed to the target,
 * as from there, target and mediators can claim the payment down to us. But the full off-chain
 * happy case completes only after partner/neighbor acknowledges receiving the Unlock.
 * So, we usually only emits this action in the end of the happy case, and it'll then contain the
 * unlock's balanceProof, which indicates the full off-chain path succeeded.
 * It'll be emitted without a balanceProof if something forces the transfer to complete
 * (e.g.  channel closed), the secret was revealed (so target was paid) but for any reason the
 * unlock didn't happen yet.
 */
export const transferred = createAction(
  'transferred',
  t.partial({ balanceProof: SignedBalanceProof }),
  TransferId,
);
export interface transferred extends ActionType<typeof transferred> {}

/**
 * A transfer failed and can't succeed anymore
 *
 * It is emitted as soon as we know the transfer failed definitely, like when a RefundTransfer is
 * received or the lock expires before revealing the secret. It notifies the user (e.g. pending
 * Promises) that the transfer failed and won't be paid (eventually, locked amount will be
 * recovered by expiring the lock).
 */
export const transferFailed = createAction('transferFailed', ErrorCodec, TransferId, true);
export interface transferFailed extends ActionType<typeof transferFailed> {}

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
export const withdrawReceiveRequest = createAction(
  'withdrawReceiveRequest',
  t.type({ message: Signed(WithdrawRequest) }),
  WithdrawId,
);
export interface withdrawReceiveRequest extends ActionType<typeof withdrawReceiveRequest> {}

/** A WithdrawConfirmation was signed and must be sent to partner */
export const withdrawSendConfirmation = createAction(
  'withdrawSendConfirmation',
  t.type({ message: Signed(WithdrawConfirmation) }),
  WithdrawId,
);
export interface withdrawSendConfirmation extends ActionType<typeof withdrawSendConfirmation> {}
