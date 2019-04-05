import { BigNumberish } from 'ethers/utils';

export interface Token {
  readonly balance: BigNumberish;
  readonly decimals: number;
  readonly units: string;
  readonly address: string;
  readonly symbol?: string;
  readonly name?: string;
}

export interface AccTokenModel {
  address: string;
  opening: number;
  open: number;
  closing: number;
  closed: number;
  settling: number;
  settled: number;
}

export interface TokenModel extends AccTokenModel {
  readonly address: string;
  readonly opening: number;
  readonly open: number;
  readonly closing: number;
  readonly closed: number;
  readonly settling: number;
  readonly settled: number;
}

export function createEmptyTokenModel(): AccTokenModel {
  return {
    address: '',
    opening: 0,
    open: 0,
    closing: 0,
    closed: 0,
    settling: 0,
    settled: 0
  };
}
