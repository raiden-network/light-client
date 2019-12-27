import { matrixPresence } from './actions';

export interface Presences {
  [address: string]: matrixPresence.success;
}
