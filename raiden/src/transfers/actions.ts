import { createStandardAction } from 'typesafe-actions';

import { Address, UInt, Secret, Hash } from '../utils/types';
import { SignedBalanceProof } from '../channels/types';
import {
  LockedTransfer,
  Processed,
  SecretRequest,
  SecretReveal,
  Unlock,
  Signed,
} from '../messages/types';

// eslint-disable-next-line @typescript-eslint/prefer-interface
type TransferId = { secrethash: Hash };

export const transfer = createStandardAction('transfer')<
  {
    tokenNetwork: Address;
    target: Address;
    amount: UInt<32>;
    fee?: UInt<32>;
    paymentId?: UInt<8>;
    secret?: Secret;
  },
  TransferId
>();

export const transferSigned = createStandardAction('transferSigned')<
  { message: Signed<LockedTransfer> },
  TransferId
>();

export const transferProcessed = createStandardAction('transferProcessed')<
  { message: Signed<Processed> },
  TransferId
>();

export const transferSecret = createStandardAction('transferSecret')<
  { secret: Secret; registerBlock?: number },
  TransferId
>();

export const transferSecretRequest = createStandardAction('transferSecretRequest')<
  { message: Signed<SecretRequest> },
  TransferId
>();

export const transferUnlock = createStandardAction('transferUnlock')<
  { message: Signed<SecretReveal> },
  TransferId
>();

export const transferUnlocked = createStandardAction('transferUnlocked')<
  { message: Signed<Unlock> },
  TransferId
>();

export const transferUnlockProcessed = createStandardAction('transferUnlockProcessed')<
  { message: Signed<Processed> },
  TransferId
>();

export const transferred = createStandardAction('transferred')<
  { balanceProof: SignedBalanceProof },
  TransferId
>();

export const transferFailed = createStandardAction('transferFailed').map(
  (payload: Error, meta: TransferId) => ({ payload, error: true, meta }),
);
