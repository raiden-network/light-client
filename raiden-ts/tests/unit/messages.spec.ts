import { BigNumber } from '@ethersproject/bignumber';
import { One, Zero } from '@ethersproject/constants';
import { Wallet } from '@ethersproject/wallet';
import { promises as fs } from 'fs';
import logging from 'loglevel';
import path from 'path';

import type { LockedTransfer } from '@/messages/types';
import { Message, MessageType } from '@/messages/types';
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
