import * as t from 'io-ts';
import { matrixPresence } from './actions';

export interface Presences {
  [address: string]: matrixPresence.success;
}

export const Caps = t.readonly(t.record(t.string /* Capabilities */, t.any));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Caps = { readonly [k: string]: any };
