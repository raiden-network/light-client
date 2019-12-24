import { matrixPresenceUpdate } from './actions';

export interface Presences {
  [address: string]: matrixPresenceUpdate;
}
