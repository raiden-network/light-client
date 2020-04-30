/* eslint-disable @typescript-eslint/camelcase */
import { Wallet } from 'ethers';
import { bigNumberify } from 'ethers/utils';
import { HashZero, One, Zero } from 'ethers/constants';
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
  Metadata,
  WithdrawRequest,
  WithdrawConfirmation,
  WithdrawExpired,
  PFSFeeUpdate,
  MonitorRequest,
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
  createBalanceHash,
} from 'raiden-ts/messages/utils';
import { Address, Hash, Secret, UInt, Signed, Int, Signature } from 'raiden-ts/utils/types';

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
      '0xb6ab946232e2b8271c21a921389b8fc8537ebb05e25e7d5eca95e25ce82c7da5',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001b6ab946232e2b8271c21a921389b8fc8537ebb05e25e7d5eca95e25ce82c7da5',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(LockedTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xa4beb47c2067e196de4cd9d5643d1c7af37caf4ac87de346e10ac27351505d405272f3d68960322bd53d1ea95460e4dd323dbef7c862fa6596444a57732ddb2b1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"LockedTransfer","chain_id":"337","message_identifier":"123456","payment_identifier":"1","nonce":"1","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":"1338","transferred_amount":"0","locked_amount":"10","recipient":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","lock":{"amount":"10","expiration":"1","secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x811957b07304d335B271feeBF46754696694b09e","initiator":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","metadata":{"routes":[{"route":["0x2A915FDA69746F515b46C520eD511401d5CCD5e2","0x811957b07304d335B271feeBF46754696694b09e"]}]},"signature":"0xa4beb47c2067e196de4cd9d5643d1c7af37caf4ac87de346e10ac27351505d405272f3d68960322bd53d1ea95460e4dd323dbef7c862fa6596444a57732ddb2b1c"}',
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
      metadata: {
        routes: [
          {
            route: ['0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address],
          },
        ],
      },
    };

    expect(createMessageHash(message)).toEqual(
      '0x8f6c25d8592b493d55a37b116b919b87172e444287d09081f7c7661762ea1074',
    );

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053ad11d651b5158961173ce2ce735c1d2ca57e8d784b9e3ad3451a446a09653fac200000000000000000000000000000000000000000000000000000000000000018f6c25d8592b493d55a37b116b919b87172e444287d09081f7c7661762ea1074',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(RefundTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x8ed40b851cf583eee2c454ce8d6366a79cd6900293de3e055074521f5f99090f6ea64db3110914911ac4f7412e37b1277616006dde6932d011def114b942e40b1b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"RefundTransfer","chain_id":"337","message_identifier":"123457","payment_identifier":"1","nonce":"1","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":"1338","transferred_amount":"0","locked_amount":"10","recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x0000000000000000000000000000000000000000000000000000000000000000","lock":{"amount":"10","expiration":"1","secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","initiator":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","metadata":{"routes":[{"route":["0x540B51eDc5900B8012091cc7c83caf2cb243aa86"]}]},"signature":"0x8ed40b851cf583eee2c454ce8d6366a79cd6900293de3e055074521f5f99090f6ea64db3110914911ac4f7412e37b1277616006dde6932d011def114b942e40b1b"}',
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
      '{"type":"Unlock","chain_id":"337","message_identifier":"123457","payment_identifier":"1","secret":"0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e","nonce":"1","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338","transferred_amount":"0","locked_amount":"10","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xd153bbef8ca5462e62ba5dceda7929fc2ee7d866e983c033afe59e7f7958b8d80c734d5fba96028e8fb689300ca3c6a47764c0c0d6fbfffca9cf70729efb8e7e1c"}',
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
      '{"type":"LockExpired","chain_id":"337","nonce":"1","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","message_identifier":"123457","channel_identifier":"1338","secrethash":"0xfdd5831261497a4de31cb31d29b3cafe1fd2dfcdadf3c4a72ed0af9bb106934d","transferred_amount":"0","locked_amount":"10","recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xdd978b011c21327d9228f8ef179646df9029e14d91df38c41da9ded4819c5e304e5a9d14fe861b475816679597b66b0b08edea0e65e9674abf03dd3876ad9d801c"}',
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
      '{"type":"SecretRequest","message_identifier":"123456","payment_identifier":"1","secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8","amount":"10","expiration":"1","signature":"0x4a8d01db29004aa733809bc1b27c11009364c4fff847b211d48d520472ea78e5584a4fea6ea9438f09e9da6c0e60fb2a8f21a614afb41e702fb6db6981e822b41b"}',
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
      '{"type":"RevealSecret","message_identifier":"123456","secret":"0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e","signature":"0x758eace7b5443a3afb5daf06eda3d2d024ca4d2cdbd0e72b36bcc9408d5bbf0d32153f53fc180c4145fd7b6b3038554484b9d3a56382b03bfed5f3ce01c5ea1b1b"}',
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
      '{"type":"Delivered","delivered_message_identifier":"123456","signature":"0x5770d597b270ad9d1225c901b1ef6bfd8782b15d7541379619c5dae02c5c03c1196291b042a4fea9dbddcb1c6bcd2a5ee19180e8dc881c2e9298757e84ad190b1c"}',
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
      '{"type":"Processed","message_identifier":"123456","signature":"0xdc1647ec6cdd805d8d4af231c5d5b2105bda2e5c7e81b9a6314f37aef9e5db8e62c253189ddb9886201427e1908876aa68d7a3ec6c45aaa3b1de4587efc70a3f1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('decodeJsonMessage invalid', () => {
    expect(() => decodeJsonMessage('{"type":"Invalid"}')).toThrowError(/\btype\b/);
    expect(() => decodeJsonMessage('{"type":"Processed"}')).toThrowError(
      'Invalid value undefined',
    );
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
      additionalHash: createMessageHash(message),
      signature: expect.any(String),
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
      '{"type":"WithdrawRequest","chain_id":"337","message_identifier":"123456","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338","participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":"10000000000000000000","nonce":"135","expiration":"182811","signature":"0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c"}',
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
      '{"type":"WithdrawConfirmation","chain_id":"337","message_identifier":"123456","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338","participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":"10000000000000000000","nonce":"135","expiration":"182811","signature":"0x5e0326b79f9ef19d6224317d54d17a55b4e1ebfc4d962388876d4575c421c4d238d50a892cd5e48d648c31c4f6ec5cb3947511a4dfe80c539875d859b1f31a0e1c"}',
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
      '{"type":"WithdrawExpired","chain_id":"337","message_identifier":"123456","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338","participant":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","total_withdraw":"10000000000000000000","nonce":"135","expiration":"182811","signature":"0xb4b2a079e00b9cfb05a3452500f052d3f1b549f3b3836c8698e6d6e71d65a34d2a52141562385b037b0a05f39484af153e84da84f6f507ebf83bc4f87183b7331c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);

    // test sign already signed message return original object
    const signed2 = await signMessage(signer, signed);
    expect(signed2).toBe(signed);
  });

  test('PFSFeeUpdate', async () => {
    const message: PFSFeeUpdate = {
      type: MessageType.PFS_FEE_UPDATE,
      canonical_identifier: {
        chain_identifier: bigNumberify(337) as UInt<32>,
        token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
        channel_identifier: bigNumberify(1338) as UInt<32>,
      },
      updating_participant: '0x14791697260E4c9A71f18484C9f997B308e59325' as Address,
      timestamp: new Date(0).toISOString().substr(0, 19),
      fee_schedule: {
        cap_fees: true,
        imbalance_penalty: null,
        proportional: Zero as Int<32>,
        flat: Zero as Int<32>,
      },
    };

    expect(packMessage(message)).toEqual(
      '0x0000000000000000000000000000000000000000000000000000000000000151e82ae5475589b828d3644e1b56546f93cd27d1a4000000000000000000000000000000000000000000000000000000000000053a14791697260e4c9a71f18484c9f997b308e59325010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080313937302d30312d30315430303a30303a3030',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(PFSFeeUpdate).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x444213b2b0a3e390b0e288ebb92cc219e1177ff8359d51517cc894643b3fdbc56da603289a967bacf42c2dcc0ba1cc98425e4524e4eca86023c776a284c2a71f1c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"PFSFeeUpdate","canonical_identifier":{"chain_identifier":"337","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338"},"updating_participant":"0x14791697260E4c9A71f18484C9f997B308e59325","timestamp":"1970-01-01T00:00:00","fee_schedule":{"cap_fees":true,"imbalance_penalty":null,"proportional":"0","flat":"0"},"signature":"0x444213b2b0a3e390b0e288ebb92cc219e1177ff8359d51517cc894643b3fdbc56da603289a967bacf42c2dcc0ba1cc98425e4524e4eca86023c776a284c2a71f1c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });

  test('RequestMonitoring', async () => {
    const balanceHash = createBalanceHash(
      Zero as UInt<32>,
      One as UInt<32>,
      '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
    );
    const message: MonitorRequest = {
      type: MessageType.MONITOR_REQUEST,
      balance_proof: {
        chain_id: bigNumberify(337) as UInt<32>,
        nonce: One as UInt<8>,
        token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
        channel_identifier: bigNumberify(1338) as UInt<32>,
        balance_hash: balanceHash,
        // data from LockedTransfer test
        additional_hash: '0xb6ab946232e2b8271c21a921389b8fc8537ebb05e25e7d5eca95e25ce82c7da5' as Hash,
        signature: '0xa4beb47c2067e196de4cd9d5643d1c7af37caf4ac87de346e10ac27351505d405272f3d68960322bd53d1ea95460e4dd323dbef7c862fa6596444a57732ddb2b1c' as Signature,
      },
      monitoring_service_contract_address: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      non_closing_participant: address,
      non_closing_signature: '0x8c52419a6f5c71b7618c066e2570592e861544f3a9d7c8de87965ee09281983068ac46f0e9116eac43f6a3628667d5109fa18ce86fc03f94321203df75c8afd81b' as Signature,
      reward_amount: bigNumberify(5) as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0x2a915fda69746f515b46c520ed511401d5ccd5e200000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000006e82ae5475589b828d3644e1b56546f93cd27d1a414791697260e4c9a71f18484c9f997b308e593258c52419a6f5c71b7618c066e2570592e861544f3a9d7c8de87965ee09281983068ac46f0e9116eac43f6a3628667d5109fa18ce86fc03f94321203df75c8afd81b0000000000000000000000000000000000000000000000000000000000000005',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(MonitorRequest).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0x0d998188ae1202dc7fc76e4fe5b5d534f54a98480701f73dbdcde8385238f995470618bbcbeccabc5573338d0e06f2ad31da872f5cac0cfa4ccd7d4ecc8628d01c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"RequestMonitoring","balance_proof":{"chain_id":"337","nonce":"1","token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":"1338","balance_hash":"0x30862afe192e832c677eadbd6e30feea77a16d82308560562bac998b00f190bb","additional_hash":"0xb6ab946232e2b8271c21a921389b8fc8537ebb05e25e7d5eca95e25ce82c7da5","signature":"0xa4beb47c2067e196de4cd9d5643d1c7af37caf4ac87de346e10ac27351505d405272f3d68960322bd53d1ea95460e4dd323dbef7c862fa6596444a57732ddb2b1c"},"monitoring_service_contract_address":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","non_closing_participant":"0x14791697260E4c9A71f18484C9f997B308e59325","non_closing_signature":"0x8c52419a6f5c71b7618c066e2570592e861544f3a9d7c8de87965ee09281983068ac46f0e9116eac43f6a3628667d5109fa18ce86fc03f94321203df75c8afd81b","reward_amount":"5","signature":"0x0d998188ae1202dc7fc76e4fe5b5d534f54a98480701f73dbdcde8385238f995470618bbcbeccabc5573338d0e06f2ad31da872f5cac0cfa4ccd7d4ecc8628d01c"}',
    );

    const decoded = decodeJsonMessage(encoded);
    expect(decoded).toEqual(signed);
  });
});
