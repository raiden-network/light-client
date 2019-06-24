import { LockedTransfer, packMessage } from 'raiden/messages';

describe('packMessage', () => {
  test('LockedTransfer', () => {
    /* eslint-disable @typescript-eslint/camelcase */
    const message = {
      chain_id: 337,
      message_identifier: 123456,
      payment_identifier: 1,
      nonce: 1,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4',
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
      channel_identifier: 1338,
      transferred_amount: 0,
      locked_amount: 10,
      recipient: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2',
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b',
      lock: {
        type: 'Lock',
        amount: 10,
        expiration: 1,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8',
      },
      target: '0x811957b07304d335B271feeBF46754696694b09e',
      initiator: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86',
      fee: 0,
      type: 'LockedTransfer',
    };

    LockedTransfer.decode(message).fold(
      error => {
        fail(error);
      },
      message => {
        expect(packMessage(message)).toEqual(
          '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001219f8ba12d6dd5c4076af98d9b608ab10351294d4433fde115fbd23243b48306',
        );
      },
    );
  });
});
