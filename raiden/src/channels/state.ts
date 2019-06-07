import * as t from 'io-ts';

import { BigNumberC } from '../store/types';
import { ChannelStateC } from './types';

export const Channel = t.intersection([
  t.type({
    state: ChannelStateC,
    totalDeposit: BigNumberC,
    partnerDeposit: BigNumberC,
  }),
  t.partial({
    id: t.number,
    settleTimeout: t.number,
    openBlock: t.number,
    closeBlock: t.number,
  }),
]);
export type Channel = t.TypeOf<typeof Channel>;
