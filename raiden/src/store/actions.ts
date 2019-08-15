import { createStandardAction } from 'typesafe-actions';

import { ShutdownReason } from '../constants';

export const raidenShutdown = createStandardAction('raidenShutdown')<{
  reason: ShutdownReason | Error;
}>();
