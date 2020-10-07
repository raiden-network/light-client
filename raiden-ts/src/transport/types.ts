import * as t from 'io-ts';
import { matrixPresence } from './actions';

export interface Presences {
  [address: string]: matrixPresence.success;
}

const CapsPrimitive = t.union([t.string, t.number, t.boolean, t.null]);
const CapsValue = t.union([CapsPrimitive, t.array(CapsPrimitive)], 'CapsValue');

export const Caps = t.readonly(t.record(t.string /* Capabilities */, CapsValue), 'Caps');
export type Caps = t.TypeOf<typeof Caps>;
