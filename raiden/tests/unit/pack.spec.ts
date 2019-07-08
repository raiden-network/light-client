import {
  Delivered,
  LockedTransfer,
  LockExpired,
  MessageType,
  Processed,
  RefundTransfer,
  RevealSecret,
  SecretRequest,
  Unlock,
} from 'raiden/messages/types';
import { packMessage } from 'raiden/messages/utils';
import { Address, Hash, Secret, UInt } from 'raiden/utils/types';
import { bigNumberify } from 'ethers/utils';
import { HashZero, One, Zero } from 'ethers/constants';

/* eslint-disable @typescript-eslint/camelcase */
describe('packMessage', () => {
  test('LockedTransfer', () => {
    const message: LockedTransfer = {
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
      type: MessageType.LOCKED_TRANSFER,
    };

    LockedTransfer.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001219f8ba12d6dd5c4076af98d9b608ab10351294d4433fde115fbd23243b48306',
        );
      },
    );
  });

  test('RefundTransfer', () => {
    const message: RefundTransfer = {
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
      type: MessageType.REFUND_TRANSFER,
    };
    RefundTransfer.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053ad11d651b5158961173ce2ce735c1d2ca57e8d784b9e3ad3451a446a09653fac200000000000000000000000000000000000000000000000000000000000000014d66a16b37edcbcb9d5d3253013b8789042a9c5b2a19ac8f84335b48ee7f05ba',
        );
      },
    );
  });

  test('Unlock', () => {
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

    Unlock.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e0000000000000000000000000000000000000000000000000000000000000001a0bf3aa37ee11d243bee523a4b0898ff3489fbf90609a4f41ef852a2cf0a31f5',
        );
      },
    );
  });

  test('LockExpired', () => {
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

    LockExpired.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0xe82ae5475589b828d3644e1b56546f93cd27d1a400000000000000000000000000000000000000000000000000000000000001510000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000053a1d9479b298eb0a60edaf962f4cf092465456ad7a0265dfe28a0fe3a2a8ecef4e00000000000000000000000000000000000000000000000000000000000000015edbeebd4f2f7c97a51f07a83d39bbc8e72a18dd12ba2141929609e4735dd791',
        );
      },
    );
  });

  test('SecretRequest', () => {
    const message: SecretRequest = {
      type: MessageType.SECRET_REQUEST,
      message_identifier: bigNumberify(123456) as UInt<8>,
      payment_identifier: One as UInt<8>,
      secrethash: '0x59cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8' as Hash,
      amount: bigNumberify(10) as UInt<32>,
      expiration: One as UInt<32>,
    };

    SecretRequest.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0x03000000000000000001e240000000000000000159cad5948673622c1d64e2322488bf01619f7ff45789741b15a9f782ce9290a8000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000001',
        );
      },
    );
  });

  test('RevealSecret', () => {
    const message: RevealSecret = {
      type: MessageType.REVEAL_SECRET,
      message_identifier: bigNumberify(123456) as UInt<8>,
      secret: '0x3bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e' as Secret,
    };

    RevealSecret.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual(
          '0x0b000000000000000001e2403bc51dd335dda4f6aee24b3f88d88c5ee0b0d43aea4ed25a384531ce29fb062e',
        );
      },
    );
  });

  test('Delivered', () => {
    const message: Delivered = {
      type: MessageType.DELIVERED,
      delivered_message_identifier: bigNumberify(123456) as UInt<8>,
    };

    Delivered.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual('0x0c000000000000000001e240');
      },
    );
  });

  test('Processed', () => {
    const message: Processed = {
      type: MessageType.PROCESSED,
      message_identifier: bigNumberify(123456) as UInt<8>,
    };

    Processed.decode(message).fold(
      error => fail(error),
      message => {
        expect(packMessage(message)).toEqual('0x00000000000000000001e240');
      },
    );
  });
});
