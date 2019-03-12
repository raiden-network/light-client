export const enum ChannelState {
  opening = 'opening',
  open = 'open',
  closing = 'closing',
  closed = 'closed',
  settling = 'settling',
  settled = 'settled',
}

export interface Channel {
  state: ChannelState;
  totalDeposit: number;
  partnerDeposit: number;
  id?: number;
  settleTimeout?: number;
  openBlock?: number;
}

export interface RaidenState {
  address: string;
  blockNumber: number;
  tokenNetworks: { [tokenNetworkAddress: string]: { [partnerAddress: string]: Channel } };
  token2tokenNetwork: { [tokenAddress: string]: string };
}

export const initialState: RaidenState = {
  address: '',
  blockNumber: 0,
  tokenNetworks: {},
  token2tokenNetwork: {},
};
