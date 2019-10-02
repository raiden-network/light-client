import { padZeros } from 'ethers/utils';

export const SignatureZero = padZeros([], 65);

export enum ShutdownReason {
  STOP = 'raidenStopped',
  ACCOUNT_CHANGED = 'providerAccountChanged',
  NETWORK_CHANGED = 'providerNetworkChanged',
}
