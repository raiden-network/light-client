import { BigNumber } from '@ethersproject/bignumber';
import { One, Zero } from '@ethersproject/constants';
import { Wallet } from '@ethersproject/wallet';
import { promises as fs } from 'fs';
import logging from 'loglevel';
import path from 'path';

import type { LockedTransfer } from '@/messages/types';
import { Message, MessageType, PFSFeeUpdate } from '@/messages/types';
import {
  createMessageHash,
  decodeJsonMessage,
  encodeJsonMessage,
  getBalanceProofFromEnvelopeMessage,
  getMessageSigner,
  signMessage,
} from '@/messages/utils';
import { jsonParse } from '@/utils/data';
import type { Address, Hash, UInt } from '@/utils/types';
import { decode, Signed } from '@/utils/types';

// sign/verify & en/decode to avoid having to duplicate all examples
describe('sign/verify, pack & encode/decode ', () => {
  const signer = new Wallet(Uint8Array.from(Array(32).keys()));
  const address = signer.address as Address; // 0xedE35562d3555e61120a151B3c8e8e91d83a378a

  test('Messages serialization & signature', async () => {
    // 13 = number of messages in Messages codec, 4 = number of expects in for-loop
    expect.assertions(4 * 13);

    const dir = path.join(__dirname, 'messages');
    const files = await fs.readdir(dir);

    const log = logging.getLogger('messages');
    log.setLevel(logging.levels.INFO);

    for (const file of files) {
      const filepath = path.join(dir, file);
      const msgtype = path.parse(file).name;
      log.info('Testing', file);

      const original = await fs.readFile(filepath, { encoding: 'utf-8' });
      const originalParsed = jsonParse(original);
      const decoded = decode(Signed(Message), originalParsed);
      expect(decoded.type).toBe(msgtype);
      expect(getMessageSigner(decoded)).toBe(address);

      const { signature: _, ...unsigned } = decoded;
      const signed = await signMessage(signer, unsigned);
      expect(signed.signature).toBe(decoded.signature);

      const encoded = encodeJsonMessage(signed);
      expect(jsonParse(encoded)).toEqual(originalParsed);
    }
  }, 10e3);

  test('PFSFeeUpdate real life example', () => {
    const encoded = {
      fee_schedule: {
        flat: '50',
        imbalance_penalty: [
          ['0', '40000000000000000'],
          ['100000000000000000', '30737338856836652'],
          ['200000000000000000', '22897336089597848'],
          ['300000000000000000', '16398536520067884'],
          ['400000000000000000', '11154192037077362'],
          ['500000000000000000', '7071067811865476'],
          ['600000000000000000', '4047715405015526'],
          ['700000000000000000', '1971801207018598'],
          ['800000000000000000', '715541752799933'],
          ['900000000000000000', '126491106406735'],
          ['1000000000000000000', '0'],
          ['1100000000000000000', '126491106406735'],
          ['1200000000000000000', '715541752799933'],
          ['1300000000000000000', '1971801207018598'],
          ['1400000000000000000', '4047715405015526'],
          ['1500000000000000000', '7071067811865476'],
          ['1600000000000000000', '11154192037077362'],
          ['1700000000000000000', '16398536520067884'],
          ['1800000000000000000', '22897336089597848'],
          ['1900000000000000000', '30737338856836652'],
          ['2000000000000000000', '40000000000000000'],
        ],
        cap_fees: false,
        proportional: '4975',
      },
      updating_participant: '0xe3170eb9b60e2a9ff066e86247d82b38e0da4ea3',
      timestamp: '2021-05-18T14:23:14.803447',
      signature:
        '0x477fde02aedd0d80323680813932ea572e4973689ee26079bec20ca30fd245a45192c9b64a9939c5cc1a99d5355aa0cb15473c988c3c7ee648649386991ceadd1c',
      canonical_identifier: {
        chain_identifier: '5',
        channel_identifier: '6034',
        token_network_address: '0xb9ccdeb57271e6db320f75e68e3a60d24f566f6d',
      },
      type: 'PFSFeeUpdate',
    };
    const decoded = decode(Signed(PFSFeeUpdate), encoded);
    expect(getMessageSigner(decoded)).toBe('0xe3170EB9B60e2A9FF066E86247D82B38E0DA4Ea3');
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
      chain_id: BigNumber.from(337) as UInt<32>,
      message_identifier: BigNumber.from(123456) as UInt<8>,
      payment_identifier: One as UInt<8>,
      nonce: One as UInt<8>,
      token_network_address: '0xe82ae5475589b828D3644e1B56546F93cD27d1a4' as Address,
      token: '0xc778417E063141139Fce010982780140Aa0cD5Ab' as Address,
      channel_identifier: BigNumber.from(1338) as UInt<32>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: BigNumber.from(10) as UInt<32>,
      recipient: '0x2A915FDA69746F515b46C520eD511401d5CCD5e2' as Address,
      locksroot: '0x607e890c54e5ba67cd483bedae3ba9da9bf2ef2fbf237b9fb39a723b2296077b' as Hash,
      lock: {
        amount: BigNumber.from(10) as UInt<32>,
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
});
