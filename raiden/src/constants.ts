import { padZeros } from 'ethers/utils';

export const SignatureZero = padZeros([], 65);

export const MATRIX_KNOWN_SERVERS_URL: { [networkName: string]: string } = {
  default:
    'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
};

export enum ShutdownReason {
  STOP = 'raidenStopped',
  ACCOUNT_CHANGED = 'providerAccountChanged',
  NETWORK_CHANGED = 'providerNetworkChanged',
}
