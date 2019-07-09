import { createStandardAction } from 'typesafe-actions';

import { Address, UInt, Secret, Hash } from '../utils/types';
import { LockedTransfer, Processed, SecretRequest, Signed } from '../messages/types';

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
  Signed<LockedTransfer>,
  TransferId
>();

export const transferProcessed = createStandardAction('transferProcessed')<
  Signed<Processed>,
  TransferId
>();

export const transferSecret = createStandardAction('transferSecret')<
  { secret: Secret; registerBlock?: number },
  TransferId
>();

export const transferSecretRequest = createStandardAction('transferSecretRequest')<
  Signed<SecretRequest>,
  TransferId
>();

export const transferFailed = createStandardAction('transferFailed').map(
  (payload: Error, meta: TransferId) => ({ payload, error: true, meta }),
);
