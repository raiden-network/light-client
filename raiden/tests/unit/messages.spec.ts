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
} from 'raiden/messages/types';
import {
  packMessage,
  signMessage,
  getMessageSigner,
  encodeJsonMessage,
  decodeJsonMessage,
  getBalanceProofFromEnvelopeMessage,
  createMessageHash,
} from 'raiden/messages/utils';
import { Address, Hash, Secret, UInt } from 'raiden/utils/types';
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
        type: 'Lock',
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x811957b07304d335B271feeBF46754696694b09e' as Address,
      initiator: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      fee: Zero as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001219f8ba12d6dd5c4076af98d9b608ab10351294d4433fde115fbd23243b48306',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(LockedTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xda8405b8e7d56425ed06e3bd4339c47a1c5e7326f92ad59fd859fa8b4888c5e4223faeaa889098c1dd8fb35cd3e3e716eb6ad628f577f8acf9fb2a895cae436e1b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"LockedTransfer","chain_id":337,"message_identifier":123456,"payment_identifier":1,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"recipient":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","lock":{"type":"Lock","amount":10,"expiration":1,"secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x811957b07304d335B271feeBF46754696694b09e","initiator":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","fee":0,"signature":"0xda8405b8e7d56425ed06e3bd4339c47a1c5e7326f92ad59fd859fa8b4888c5e4223faeaa889098c1dd8fb35cd3e3e716eb6ad628f577f8acf9fb2a895cae436e1b"}',
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
        type: 'Lock',
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      initiator: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      fee: Zero as UInt<32>,
    };

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053ad11d651b5158961173ce2ce735c1d2ca57e8d784b9e3ad3451a446a09653fac200000000000000000000000000000000000000000000000000000000000000014d66a16b37edcbcb9d5d3253013b8789042a9c5b2a19ac8f84335b48ee7f05ba',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(RefundTransfer).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xde9fd2dc3357a25fb843339e2d242192af84597da5112a36b98853da65b68ed05557604903610714f065bec3064b0b7fdf2f6b029db2615741c3b95c6931f8901c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"RefundTransfer","chain_id":337,"message_identifier":123457,"payment_identifier":1,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","token":"0xc778417E063141139Fce010982780140Aa0cD5Ab","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x0000000000000000000000000000000000000000000000000000000000000000","lock":{"type":"Lock","amount":10,"expiration":1,"secrethash":"0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8"},"target":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","initiator":"0x2A915FDA69746F515b46C520eD511401d5CCD5e2","fee":0,"signature":"0xde9fd2dc3357a25fb843339e2d242192af84597da5112a36b98853da65b68ed05557604903610714f065bec3064b0b7fdf2f6b029db2615741c3b95c6931f8901c"}',
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

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001a0bf3aa37ee11d243bee523a4b0898ff3489fbf90609a4f41ef852a2cf0a31f5',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(Unlock).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xbfc28e6ff99c4a3db920576b853a5484059a118c4f9a9105ec92ca0b68d873b0418266a6a32a8bb65652b4a38beb7440d7ee79263dc6e9e9652ab2443f5605951b',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"Secret","chain_id":337,"message_identifier":123457,"payment_identifier":1,"secret":"0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e","nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","channel_identifier":1338,"transferred_amount":0,"locked_amount":10,"locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xbfc28e6ff99c4a3db920576b853a5484059a118c4f9a9105ec92ca0b68d873b0418266a6a32a8bb65652b4a38beb7440d7ee79263dc6e9e9652ab2443f5605951b"}',
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

    expect(packMessage(message)).toEqual(
      '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e00000000000000000000000000000000000000000000000000000000000000015edbeebd4f2f7c97a51f07a83d39bbc8e72a18dd12ba2141929609e4735dd791',
    );

    const signed = await signMessage(signer, message);
    expect(Signed(LockExpired).is(signed)).toBe(true);
    expect(signed.signature).toBe(
      '0xecd53238b2aaf0885b8317f1b840fbc4f8cb22fb39f712284bda21e9842df5ca2f821a007b7196d0f8bce4e002717c9a86195532a82c74e8f403ee6b8f3e12641c',
    );
    expect(getMessageSigner(signed)).toBe(address);

    const encoded = encodeJsonMessage(signed);
    expect(encoded).toBe(
      '{"type":"LockExpired","chain_id":337,"nonce":1,"token_network_address":"0xe82ae5475589b828D3644e1B56546F93cD27d1a4","message_identifier":123457,"channel_identifier":1338,"secrethash":"0xfdd5831261497a4de31cb31d29b3cafe1fd2dfcdadf3c4a72ed0af9bb106934d","transferred_amount":0,"locked_amount":10,"recipient":"0x540B51eDc5900B8012091cc7c83caf2cb243aa86","locksroot":"0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b","signature":"0xecd53238b2aaf0885b8317f1b840fbc4f8cb22fb39f712284bda21e9842df5ca2f821a007b7196d0f8bce4e002717c9a86195532a82c74e8f403ee6b8f3e12641c"}',
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
    expect(() => decodeJsonMessage('{"type":"Invalid"}')).toThrowError('Message "type"');
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
        type: 'Lock',
        amount: bigNumberify(10) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      },
      target: '0x811957b07304d335B271feeBF46754696694b09e' as Address,
      initiator: '0x540B51eDc5900B8012091cc7c83caf2cb243aa86' as Address,
      fee: Zero as UInt<32>,
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
});
