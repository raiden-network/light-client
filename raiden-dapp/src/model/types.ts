import type { BigNumber, BigNumberish, providers } from 'ethers';

import type { RaidenPaths } from 'raiden-ts';

export interface Token {
  readonly address: string;
  readonly decimals?: number;
  readonly balance?: BigNumberish;
  readonly symbol?: string;
  readonly name?: string;
}

export interface Presences {
  [address: string]: boolean;
}

export interface AccTokenModel {
  name: string;
  symbol: string;
  address: string;
  opening: number;
  open: number;
  closing: number;
  closed: number;
  settling: number;
  settled: number;

  [index: string]: number | string;
}

export interface TokenModel extends AccTokenModel {
  readonly name: string;
  readonly symbol: string;
  readonly address: string;
  readonly opening: number;
  readonly open: number;
  readonly closing: number;
  readonly closed: number;
  readonly settling: number;
  readonly settled: number;
}
export interface Progress {
  readonly current: number;
  readonly total: number;
}

export interface StepDescription {
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

type RaidenPath = RaidenPaths[number];
export interface Route extends RaidenPath {
  readonly key: number;
  readonly hops: number;
  readonly displayFee?: string;
}

export interface Transfer {
  pfsAddress?: string;
  serviceFee?: BigNumber;
  serviceToken?: Token;
  mediationFee?: BigNumber;
  target: string;
  hops: number;
  paymentId: BigNumberish;
  transferAmount: BigNumber;
  transferToken: Token;
  transferTotal: BigNumber;
}

export const emptyDescription = (): StepDescription => ({
  label: '',
  title: '',
  description: '',
});

export const emptyTokenModel = (): AccTokenModel => ({
  name: '',
  symbol: '',
  address: '',
  opening: 0,
  open: 0,
  closing: 0,
  closed: 0,
  settling: 0,
  settled: 0,
});

export const PlaceHolderNetwork: providers.Network = {
  name: '',
  chainId: -1,
};

export enum ErrorCode {
  DEPLOYMENT_INFO_PARSING_FAILED = 'deployment-info-parsing-failed',
  UNSUPPORTED_NETWORK = 'unsupported-network',
  SDK_INITIALIZATION_FAILED = 'sdk-initialization-failed',
  STATE_MIGRATION_FAILED = 'state-migration-failed',
}
