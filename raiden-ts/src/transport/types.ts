import { ActionType } from 'typesafe-actions';
import { matrixPresenceUpdate } from './actions';

export interface Presences {
  [address: string]: ActionType<typeof matrixPresenceUpdate>;
}
