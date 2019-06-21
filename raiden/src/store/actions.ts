import { createStandardAction } from 'typesafe-actions';

import { ShutdownReason } from '../constants';

export const raidenInit = createStandardAction('raidenInit')<undefined>();

export const raidenShutdown = createStandardAction('raidenShutdown')<{
  reason: ShutdownReason | Error;
}>();
