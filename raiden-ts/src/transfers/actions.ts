import { createStandardAction } from 'typesafe-actions';

import { Address, UInt, Int, Secret, Hash, Signed } from '../utils/types';
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

type TransferId = { secrethash: Hash };

/** A request to initiate a transfer */
export const transfer = createStandardAction('transfer')<
  {
    tokenNetwork: Address;
    target: Address;
    value: UInt<32>;
    paths: Paths;
    paymentId: UInt<8>;
    secret?: Secret;
  },
  TransferId
>();

/** A LockedTransfer was signed and should be sent to partner */
export const transferSigned = createStandardAction('transferSigned')<
  { message: Signed<LockedTransfer>; fee: Int<32> },
  TransferId
>();

/** Partner acknowledge they received and processed our LockedTransfer */
export const transferProcessed = createStandardAction('transferProcessed')<
  { message: Signed<Processed> },
  TransferId
>();

/** Register a secret */
export const transferSecret = createStandardAction('transferSecret')<
  { secret: Secret; registerBlock?: number },
  TransferId
>();

/** A valid SecretRequest received from target */
export const transferSecretRequest = createStandardAction('transferSecretRequest')<
  { message: Signed<SecretRequest> },
  TransferId
>();

/** A SecretReveal sent to target */
export const transferSecretReveal = createStandardAction('transferSecretReveal')<
  { message: Signed<SecretReveal> },
  TransferId
>();

/** Unlock request after partner also revealed they know the secret */
export const transferUnlock = createStandardAction('transferUnlock')<undefined, TransferId>();

/** Signed Unlock to be sent to partner */
export const transferUnlocked = createStandardAction('transferUnlocked')<
  { message: Signed<Unlock> },
  TransferId
>();

/** Partner acknowledge they received and processed our Unlock */
export const transferUnlockProcessed = createStandardAction('transferUnlockProcessed')<
  { message: Signed<Processed> },
  TransferId
>();

/** A request to expire a given transfer */
export const transferExpire = createStandardAction('transferExpire')<undefined, TransferId>();

/** A transfer LockExpired message/BalanceProof successfuly generated */
export const transferExpired = createStandardAction('transferExpired')<
  { message: Signed<LockExpired> },
  TransferId
>();

/**
 * A transfer expiration request failed for any reason
 * e.g. user rejected sign promopt. It should eventually get prompted again, on a future newBlock
 * action which sees this transfer should be expired but sent.lockExpired didn't get set yet.
 */
export const transferExpireFailed = createStandardAction(
  'transferExpireFailed',
).map((payload: Error, meta: TransferId) => ({ payload, error: true, meta }));

/** Partner acknowledge they received and processed our LockExpired */
export const transferExpireProcessed = createStandardAction('transferExpireProcessed')<
  { message: Signed<Processed> },
  TransferId
>();

/** A transfer was refunded */
export const transferRefunded = createStandardAction('transferRefunded')<
  { message: Signed<RefundTransfer> },
  TransferId
>();

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
export const transferred = createStandardAction('transferred')<
  { balanceProof?: SignedBalanceProof },
  TransferId
>();

/**
 * A transfer failed and can't succeed anymore
 *
 * It is emitted as soon as we know the transfer failed definitely, like when a RefundTransfer is
 * received or the lock expires before revealing the secret. It notifies the user (e.g. pending
 * Promises) that the transfer failed and won't be paid (eventually, locked amount will be
 * recovered by expiring the lock).
 */
export const transferFailed = createStandardAction(
  'transferFailed',
).map((payload: Error, meta: TransferId) => ({ payload, error: true, meta }));

/** A pending transfer isn't needed anymore and should be cleared from state */
export const transferClear = createStandardAction('transferClear')<undefined, TransferId>();

// Withdraw actions

type WithdrawId = {
  tokenNetwork: Address;
  partner: Address;
  totalWithdraw: UInt<32>;
  expiration: number;
};

/** A WithdrawRequest was received from partner */
export const withdrawReceiveRequest = createStandardAction('withdrawReceiveRequest')<
  { message: Signed<WithdrawRequest> },
  WithdrawId
>();

/** A WithdrawConfirmation was signed and must be sent to partner */
export const withdrawSendConfirmation = createStandardAction('withdrawSendConfirmation')<
  { message: Signed<WithdrawConfirmation> },
  WithdrawId
>();
