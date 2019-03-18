import { BigNumberish } from 'ethers/utils';

export interface Token {
  readonly balance: BigNumberish;
  readonly decimals: number;
  readonly units: string;
  readonly address: string;
  readonly symbol?: string;
  readonly name?: string;
}
