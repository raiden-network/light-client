/* eslint-disable @typescript-eslint/camelcase */
import { Wallet } from 'ethers';
import {
  Delivered,
  LockedTransfer,
  LockExpired,
  MessageType,
  Processed,
  RefundTransfer,
  SecretReveal,
  SecretRequest,
  Unlock,
  Signed,
  Metadata,
  ToDevice,
  WithdrawRequest,
  WithdrawConfirmation,
  WithdrawExpired,
} from 'raiden-ts/messages/types';
import {
  packMessage,
  signMessage,
  getMessageSigner,
  encodeJsonMessage,
  decodeJsonMessage,
  getBalanceProofFromEnvelopeMessage,
  createMessageHash,
  createMetadataHash,
} from 'raiden-ts/messages/utils';
import { Address, Hash, Secret, UInt } from 'raiden-ts/utils/types';
import { bigNumberify } from 'ethers/utils';
import { HashZero, One, Zero } from 'ethers/constants';

// sign/verify & en/decode to avoid having to duplicate all examples
describe('sign/verify, pack & encode/decode ', () => {
  const signer = new Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
  const address = signer.address as Address; // 0x14791697260E4c9A71f18484C9f997B308e59325

  test('LockedTransfer', async () => {
    const message: LockedTransfer = {
      type: MessageType.LOCKED_TRANSFER,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123456) as UInt<8>,
      payment_identifier: One as UInt<8>,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: bigNumberify(10) as UInt<32>,
      recipient: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
      lock: {
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x811957b07304d335B271feeBF46754696694b09e' as Address,
      initiator: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      fee: Zero as UInt<32>,
      metadata: {
        routes: [
          {
            route: [
              '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
              '0x811957b07304d335B271feeBF46754696694b09e' as Address,
            ],
          },
        ],
      },
    };

    expect(createMessageHash(message)).toEqual(
      '0x095a9cd18a990af080bab703e5004602b13ac8e2e4295421b73bd99c3c778967',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001095a9cd18a990af080bab703e5004602b13ac8e2e4295421b73bd99c3c778967',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(LockedTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x81a29e70b8f36379a3c0939f1e23c66a75a820dddfa87319d5022431cdc5ad0471281e13437ae58f0d3feb80f0193ede01f2721c82610c8f0b782ec723e85be21c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"LockedTransfer","chain_id":337,"message_identifier":123456,"payment_identifier":1,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"recipient":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","lock":{"amount":10,"expiration":1,"secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x811957b07304d335B271feeBF46754696694b09e","initiator":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","fee":0,"metadata":{"routes":[{"route":["0x2A915FDA69746F515b46C520eD511401d5CCD5e2","0x811957b07304d335B271feeBF46754696694b09e"]}]},"signature":"0x81a29e70b8f36379a3c0939f1e23c66a75a820dddfa87319d5022431cdc5ad0471281e13437ae58f0d3feb80f0193ede01f2721c82610c8f0b782ec723e85be21c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('RefundTransfer', async () => {
    const message: RefundTransfer = {
      type: MessageType.REFUND_TRANSFER,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123457) as UInt<8>,
      payment_identifier: One as UInt<8>,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: bigNumberify(10) as UInt<32>,
      recipient: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      locksroot: HashZero as Hash,
      lock: {
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      initiator: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      fee: Zero as UInt<32>,
      metadata: {
        routes: [
          {
            route: ['0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address],
          },
        ],
      },
    };

    expect(createMessageHash(message)).toEqual(
      '0x50e01fec6308b0a39230f2adf47ea697b2e581472760171b35d0a6a9ea8633bb',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053ad11d651b5158961173ce2ce735c1d2ca57e8d784b9e3ad3451a446a09653fac2000000000000000000000000000000000000000000000000000000000000000150e01fec6308b0a39230f2adf47ea697b2e581472760171b35d0a6a9ea8633bb',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(RefundTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x7ec958b5d0accea573474e21298bcb38c35b48f54a1fafcf0beba7ed48e2a9f21f28742471124e3f15fee445c46b130756dc9d4115563b1a420266caec65c6c71c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"RefundTransfer","chain_id":337,"message_identifier":123457,"payment_identifier":1,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x0000000000000000000000000000000000000000000000000000000000000000","lock":{"amount":10,"expiration":1,"secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","initiator":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","fee":0,"metadata":{"routes":[{"route":["0x540B51eDc5900B8012091cc7c83caf2cb243aa86"]}]},"signature":"0x7ec958b5d0accea573474e21298bcb38c35b48f54a1fafcf0beba7ed48e2a9f21f28742471124e3f15fee445c46b130756dc9d4115563b1a420266caec65c6c71c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('Unlock', async () => {
    const message: Unlock = {
      type: MessageType.UNLOCK,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123457) as UInt<8>,
      payment_identifier: One as UInt<8>,
      secret: '0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e' as Secret,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: bigNumberify(10) as UInt<32>,
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
    };

    expect(createMessageHash(message)).toEqual(
      '0x28603014ed14910483d354ef0160767629dbaadd55403ad271319f9d439531f1',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e000000000000000000000000000000000000000000000000000000000000000128603014ed14910483d354ef0160767629dbaadd55403ad271319f9d439531f1',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(Unlock).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xd153bbef8ca5462e62ba5dceda7929fc2ee7d866e983c033afe59e7f7958b8d80c734d5fba96028e8fb689300ca3c6a47764c0c0d6fbfffca9cf70729efb8e7e1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"Unlock","chain_id":337,"message_identifier":123457,"payment_identifier":1,"secret":"0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e","nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xd153bbef8ca5462e62ba5dceda7929fc2ee7d866e983c033afe59e7f7958b8d80c734d5fba96028e8fb689300ca3c6a47764c0c0d6fbfffca9cf70729efb8e7e1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('LockExpired', async () => {
    const message: LockExpired = {
      type: MessageType.LOCK_EXPIRED,
      chain_id: bigNumberify(337) as UInt<32>,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      message_identifier: bigNumberify(123457) as UInt<8>,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      secrethash: '0xfdd5831261497a4de31cb31d29b3cafe1fd2dfcdadf3c4a72ed0af9bb106934d' as Hash,
      transferred_amount: Zero as UInt<32>,
      locked_amount: bigNumberify(10) as UInt<32>,
      recipient: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
    };

    expect(createMessageHash(message)).toEqual(
      '0x0d18bb3681423c08a7709849bb4ac045fed99551830031922ff4457a7b5eea1a',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e00000000000000000000000000000000000000000000000000000000000000010d18bb3681423c08a7709849bb4ac045fed99551830031922ff4457a7b5eea1a',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(LockExpired).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xdd978b011c21327d9228f8ef179646df9029e14d91df38c41da9ded4819c5e304e5a9d14fe861b475816679597b66b0b08edea0e65e9674abf03dd3876ad9d801c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"LockExpired","chain_id":337,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","message_identifier":123457,"channel_identifier":1338,"secrethash":"0xfdd5831261497a4de31cb31d29b3cafe1fd2dfcdadf3c4a72ed0af9bb106934d","transferred_amount":0,"locked_amount":10,"recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xdd978b011c21327d9228f8ef179646df9029e14d91df38c41da9ded4819c5e304e5a9d14fe861b475816679597b66b0b08edea0e65e9674abf03dd3876ad9d801c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('SecretRequest', async () => {
    const message: SecretRequest = {
      type: MessageType.SECRET_REQUEST,
      message_identifier: bigNumberify(123456) as UInt<8>,
      payment_identifier: One as UInt<8>,
      secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      amount: bigNumberify(10) as UInt<32>,
      expiration: One as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0x03000000000000000001e240000000000000000159cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000001',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(SecretRequest).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x4a8d01db29004aa733809bc1b27c11009364c4fff847b211d48d520472ea78e5584a4fea6ea9438f09e9da6c0e60fb2a8f21a614afb41e702fb6db6981e822b41b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"SecretRequest","message_identifier":123456,"payment_identifier":1,"secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8","amount":10,"expiration":1,"signature":"0x4a8d01db29004aa733809bc1b27c11009364c4fff847b211d48d520472ea78e5584a4fea6ea9438f09e9da6c0e60fb2a8f21a614afb41e702fb6db6981e822b41b"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('SecretReveal', async () => {
    const message: SecretReveal = {
      type: MessageType.SECRET_REVEAL,
      message_identifier: bigNumberify(123456) as UInt<8>,
      secret: '0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e' as Secret,
    };

    expect(packMessage(message)).toEqual(
      '0x0b000000000000000001e2403bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(SecretReveal).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x758eace7b5443a3afb5daf06eda3d2d024ca4d2cdbd0e72b36bcc9408d5bbf0d32153f53fc180c4145fd7b6b3038554484b9d3a56382b03bfed5f3ce01c5ea1b1b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"RevealSecret","message_identifier":123456,"secret":"0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e","signature":"0x758eace7b5443a3afb5daf06eda3d2d024ca4d2cdbd0e72b36bcc9408d5bbf0d32153f53fc180c4145fd7b6b3038554484b9d3a56382b03bfed5f3ce01c5ea1b1b"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('Delivered', async () => {
    const message: Delivered = {
      type: MessageType.DELIVERED,
      delivered_message_identifier: bigNumberify(123456) as UInt<8>,
    };

    expect(packMessage(message)).toEqual('0x0c000000000000000001e240');

    const signed = await signMessage(signer, message);
    expect(Signed(Delivered).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x5770d597b270ad9d1225c901b1ef6bfd8782b15d7541379619c5dae02c5c03c1196291b042a4fea9dbddcb1c6bcd2a5ee19180e8dc881c2e9298757e84ad190b1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"Delivered","delivered_message_identifier":123456,"signature":"0x5770d597b270ad9d1225c901b1ef6bfd8782b15d7541379619c5dae02c5c03c1196291b042a4fea9dbddcb1c6bcd2a5ee19180e8dc881c2e9298757e84ad190b1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('Processed', async () => {
    const message: Processed = {
      type: MessageType.PROCESSED,
      message_identifier: bigNumberify(123456) as UInt<8>,
    };

    expect(packMessage(message)).toEqual('0x00000000000000000001e240');

    const signed = await signMessage(signer, message);
    expect(Signed(Processed).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xdc1647ec6cdd805d8d4af231c5d5b2105bda2e5c7e81b9a6314f37aef9e5db8e62c253189ddb9886201427e1908876aa68d7a3ec6c45aaa3b1de4587efc70a3f1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"Processed","message_identifier":123456,"signature":"0xdc1647ec6cdd805d8d4af231c5d5b2105bda2e5c7e81b9a6314f37aef9e5db8e62c253189ddb9886201427e1908876aa68d7a3ec6c45aaa3b1de4587efc70a3f1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('decodeJsonMessage invalid', () => {
    expect(() => decodeJsonMessage('{"type":"Invalid"}')).toThrowError('/type:');
    expect(() =>
      decodeJsonMessage('{"type":"Processed","message_identifier":123456}'),
    ).toThrowError('Invalid value undefined');
  });

  test('getBalanceProofFromEnvelopeMessage', async () => {
    const message: LockedTransfer = {
      type: MessageType.LOCKED_TRANSFER,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123456) as UInt<8>,
      payment_identifier: One as UInt<8>,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: bigNumberify(10) as UInt<32>,
      recipient: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
      lock: {
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x811957b07304d335B271feeBF46754696694b09e' as Address,
      initiator: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      fee: Zero as UInt<32>,
      metadata: {
        routes: [
          {
            route: [
              '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
              '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
              '0x811957b07304d335B271feeBF46754696694b09e' as Address,
            ],
          },
        ],
      },
    };

    const signed = await signMessage(signer, message);
    expect(getBalanceProofFromEnvelopeMessage(signed)).toEqual({
      chainId: message.chain_id,
      tokenNetworkAddress: message.token_network_address,
      channelId: message.channel_identifier,
      nonce: message.nonce,
      transferredAmount: message.transferred_amount,
      lockedAmount: message.locked_amount,
      locksroot: message.locksroot,
      messageHash: createMessageHash(message),
      signature: expect.any(String),
      sender: address,
    });
  });

  test('create a metadata hash', () => {
    const metadata: Metadata = {
      routes: [
        {
          route: [
            '0x77952Ce83Ca3cad9F7AdcFabeDA85Bd2F1f52008' as Address,
            '0x94622cC2A5b64a58C25A129d48a2bEEC4b65b779' as Address,
          ],
        },
      ],
    };

    expect(createMetadataHash(metadata)).toEqual(
      '0x24b7955a3be270fd6c9513737759f42741653e9e39d901f7e2f255cc71dd4ae5',
    );
  });

  test('ToDevice', async () => {
    const message: ToDevice = {
      type: MessageType.TO_DEVICE,
      message_identifier: bigNumberify(123456) as UInt<8>,
    };

    expect(packMessage(message)).toEqual('0x0e000000000000000001e240');

    const signed = await signMessage(signer, message);
    expect(Signed(ToDevice).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x26674d7687baf09d21185664daf85cf6a9f9671d61f00e85d32621a721c3b4e251197dafe01d6930f1d86177e119dd0948f206d352204eb986b286b6b76a541d1b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"ToDevice","message_identifier":123456,"signature":"0x26674d7687baf09d21185664daf85cf6a9f9671d61f00e85d32621a721c3b4e251197dafe01d6930f1d86177e119dd0948f206d352204eb986b286b6b76a541d1b"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('WithdrawRequest', async () => {
    const message: WithdrawRequest = {
      type: MessageType.WITHDRAW_REQUEST,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123456) as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      participant: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      total_withdraw: bigNumberify('10000000000000000000') as UInt<32>,
      nonce: bigNumberify(135) as UInt<8>,
      expiration: bigNumberify(182811) as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000053a2a915fda69746f515b46c520ed511401d5ccd5e20000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000000000000000000000000000000000000002ca1b',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(WithdrawRequest).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"WithdrawRequest","chain_id":337,"message_identifier":123456,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":1338,"participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":10000000000000000000,"nonce":135,"expiration":182811,"signature":"0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('WithdrawConfirmation', async () => {
    const message: WithdrawConfirmation = {
      type: MessageType.WITHDRAW_CONFIRMATION,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123456) as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      participant: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      total_withdraw: bigNumberify('10000000000000000000') as UInt<32>,
      nonce: bigNumberify(135) as UInt<8>,
      expiration: bigNumberify(182811) as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000053a2a915fda69746f515b46c520ed511401d5ccd5e20000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000000000000000000000000000000000000002ca1b',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(WithdrawConfirmation).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"WithdrawConfirmation","chain_id":337,"message_identifier":123456,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":1338,"participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":10000000000000000000,"nonce":135,"expiration":182811,"signature":"0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('WithdrawExpired', async () => {
    const message: WithdrawExpired = {
      type: MessageType.WITHDRAW_EXPIRED,
      chain_id: bigNumberify(337) as UInt<32>,
      message_identifier: bigNumberify(123456) as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      channel_identifier: bigNumberify(1338) as UInt<32>,
      participant: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      total_withdraw: bigNumberify('10000000000000000000') as UInt<32>,
      nonce: bigNumberify(135) as UInt<8>,
      expiration: bigNumberify(182811) as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0x110000000000000000000000000000000000000000000000000000000000000000000087000000000001e240e82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000053a2a915fda69746f515b46c520ed511401d5ccd5e20000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000000000000000000000000000000000000002ca1b',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(WithdrawExpired).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xb4b2a079e00b9cfb05a3452500f052d3f1b549f3b3836c8698e6d6e71d65a34d2a52141562385b037b0a05f39484af153e84da84f6f507ebf83bc4f87183b7331c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"WithdrawExpired","chain_id":337,"message_identifier":123456,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":1338,"participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":10000000000000000000,"nonce":135,"expiration":182811,"signature":"0xb4b2a079e00b9cfb05a3452500f052d3f1b549f3b3836c8698e6d6e71d65a34d2a52141562385b037b0a05f39484af153e84da84f6f507ebf83bc4f87183b7331c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });
});
