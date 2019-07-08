import { createStandardAction } from 'typesafe-actions';

import { Address, UInt, Secret, Hash } from '../utils/types';
import { LockedTransfer } from '../messages/types';

// eslint-disable-next-line @typescript-eslint/prefer-interface
type TransferId = { paymentId: UInt<8> };

export const transfer = createStandardAction('transfer')<
  {
    tokenNetwork: Address;
    target: Address;
    amount: UInt<32>;
    fee?: UInt<32>;
    secret?: Secret;
    secrethash?: Hash;
  },
  TransferId
>();

export const transferSigned = createStandardAction('transferSigned')<
  Required<LockedTransfer>,
  TransferId
>();

export const transferSecret = createStandardAction('transferSecret')<
  { secret: Secret; registerBlock?: number },
  { secrethash: Hash }
>();

export const transferFailed = createStandardAction('transferFailed').map(
  (payload: Error, meta: TransferId) => ({ payload, error: true, meta }),
);
