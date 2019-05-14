import { arrayify } from 'ethers/utils';

export const SignatureZero = arrayify('0x' + '00'.repeat(65));

export const MATRIX_KNOWN_SERVERS_URL: { [networkName: string]: string } = {
  default:
    'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
};
