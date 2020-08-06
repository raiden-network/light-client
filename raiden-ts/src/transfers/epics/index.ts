import { CloseEpics } from './close';
import { ExpireEpics } from './expire';
import { LockedEpics } from './locked';
import { InitEpics } from './init';
import { MediateEpics } from './mediate';
import { ProcessedEpics } from './processed';
import { RefundEpics } from './refund';
import { RetryEpics } from './retry';
import { SecretEpics } from './secret';
import { WithdrawEpics } from './withdraw';

export const TransfersEpics = [
  ...CloseEpics,
  ...ExpireEpics,
  ...LockedEpics,
  ...InitEpics,
  ...MediateEpics,
  ...ProcessedEpics,
  ...RefundEpics,
  ...RetryEpics,
  ...SecretEpics,
  ...WithdrawEpics,
];
