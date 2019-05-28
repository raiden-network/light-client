import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';

import { createEnumType, BigNumberType } from './types';

export enum ChannelState {
  opening = 'opening',
  open = 'open',
  closing = 'closing',
  closed = 'closed',
  settleable = 'settleable',
  settling = 'settling',
  settled = 'settled',
}

const ChannelStateType = createEnumType<ChannelState>(ChannelState, 'ChannelState');

export const ChannelType = t.intersection([
  t.type({
    state: ChannelStateType,
    totalDeposit: BigNumberType,
    partnerDeposit: BigNumberType,
  }),
  t.partial({
    id: t.number,
    settleTimeout: t.number,
    openBlock: t.number,
    closeBlock: t.number,
  }),
]);

export type Channel = t.TypeOf<typeof ChannelType>;

/*export interface Channel {
  state: ChannelState;
  totalDeposit: number;
  partnerDeposit: number;
  id?: number;
  settleTimeout?: number;
  openBlock?: number;
  closeBlock?: number;
}*/

const RaidenMatrixSetupType = t.type({
  userId: t.string,
  accessToken: t.string,
  deviceId: t.string,
  displayName: t.string,
});

export type RaidenMatrixSetup = t.TypeOf<typeof RaidenMatrixSetupType>;

export const RaidenStateType = t.intersection([
  t.type({
    address: t.string,
    blockNumber: t.number,
    tokenNetworks: t.record(t.string, t.record(t.string, ChannelType)),
    token2tokenNetwork: t.record(t.string, t.string),
  }),
  t.partial({
    transport: t.partial({
      matrix: t.intersection([
        t.type({
          server: t.string,
        }),
        t.partial({
          setup: RaidenMatrixSetupType,
          address2rooms: t.record(t.string, t.array(t.string)),
        }),
      ]),
    }),
  }),
]);

export type RaidenState = t.TypeOf<typeof RaidenStateType>;

export function encodeRaidenState(state: RaidenState): string {
  return JSON.stringify(RaidenStateType.encode(state), undefined, 2);
}

export function decodeRaidenState(data: unknown): RaidenState {
  if (typeof data === 'string') data = JSON.parse(data);
  const validationResult = RaidenStateType.decode(data);
  ThrowReporter.report(validationResult); // throws if decode failed
  return validationResult.value as RaidenState;
}

/*
export interface RaidenState {
  address: string;
  blockNumber: number;
  tokenNetworks: { [tokenNetworkAddress: string]: { [partnerAddress: string]: Channel } };
  token2tokenNetwork: { [tokenAddress: string]: string };
}*/

export const initialState: RaidenState = {
  address: '',
  blockNumber: 0,
  tokenNetworks: {},
  token2tokenNetwork: {},
};
