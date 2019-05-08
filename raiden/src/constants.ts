import { arrayify } from 'ethers/utils';

export const SignatureZero = arrayify('0x' + '00'.repeat(65));

export const MATRIX_KNOWN_SERVERS_URL: { [networkName: string]: string } = {
  homestead:
    'https://github.com/raiden-network/raiden-transport/raw/master/known_servers.main.yaml',
  default: 'https://github.com/raiden-network/raiden-transport/raw/master/known_servers.test.yaml',
};
