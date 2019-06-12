// import * as t from 'io-ts';
import { BigNumber, bigNumberify, keccak256 } from 'ethers/utils';
import { Arrayish, arrayify, concat, hexlify, isArrayish, padZeros } from 'ethers/utils/bytes';
import { HashZero } from 'ethers/constants';

import { BigNumberC, Bytes, Hash } from '../store/types';
import { Message, MessageType } from './types';

const CMDIDs: { readonly [T in MessageType]: number } = {
  [MessageType.DELIVERED]: 12,
  [MessageType.PROCESSED]: 0,
  [MessageType.SECRET_REQUEST]: 3,
  [MessageType.REVEAL_SECRET]: 11,
  [MessageType.LOCKED_TRANSFER]: 7,
  [MessageType.REFUND_TRANSFER]: 8,
  [MessageType.UNLOCK]: 4,
  [MessageType.LOCK_EXPIRED]: 13,
};

/**
 * Encode data to a bytes array of exactly length size
 * Throw if data can't be made to fit in length.
 * @param data May be of multiple types:
 *      - number|BigNumber: Encoded in the big-endian byte-order and left-zero-padded to length
 *      - string: Must be hex-encoded string of length bytes
 *      - number[] Must be of exactly of length size (left/right-pad it before if needed)
 * @returns Uint8Array byte-array of lenght, suitable to be concatenated or hexlified
 */
function encode(data: number | Arrayish | BigNumber, length: number): Uint8Array {
  let bytes: Uint8Array;
  if (typeof data === 'number') data = bigNumberify(data);
  if (BigNumberC.is(data)) {
    if (data.lt(0)) throw new Error('Number is negative');
    bytes = arrayify(data);
    if (bytes.length > length) throw new Error('Number too large');
    bytes = padZeros(bytes, length);
  } else if (isArrayish(data)) {
    bytes = arrayify(data);
    if (bytes.length !== length)
      throw new Error('Uint8Array or hex string must be of exact length');
  } else {
    throw new Error('data is not a HexString or Uint8Array');
  }
  return bytes;
}

/**
 * Pack a message in a hex-string format, **without** signature
 * This packed hex-byte-array can then be used for signing.
 * On Raiden python client, this is the output of `_data_to_sign` method of the messages, as the
 * actual packed encoding was once used for binary transport protocols, but nowadays is used only
 * for generating data to be signed, which is the purpose of our implementation.
 *
 * @param message Message to be packed
 * @returns HexBytes hex-encoded string data representing message in binary format
 */
export function packMessage(message: Message): Bytes {
  let messageHash: Hash, balanceHash: Hash;
  switch (message.type) {
    case MessageType.DELIVERED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.delivered_message_identifier, 8),
        ]),
      );
    case MessageType.PROCESSED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.message_identifier, 8),
        ]),
      );
    case MessageType.LOCKED_TRANSFER:
      // hash of packed representation of the whole message
      messageHash = keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.nonce, 8),
          encode(message.chain_id, 32),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.lock.expiration, 32),
          encode(message.token_network_address, 20),
          encode(message.token, 20),
          encode(message.channel_identifier, 32),
          encode(message.recipient, 20),
          encode(message.target, 20),
          encode(message.initiator, 20),
          encode(message.locksroot, 32),
          encode(message.lock.secrethash, 32),
          encode(message.transferred_amount, 32),
          encode(message.locked_amount, 32),
          encode(message.lock.amount, 32),
          encode(message.fee, 32),
        ]),
      );
      balanceHash =
        message.transferred_amount.eq(0) &&
        message.locked_amount.eq(0) &&
        message.locksroot === HashZero
          ? HashZero
          : keccak256(
              concat([
                encode(message.transferred_amount, 32),
                encode(message.locked_amount, 32),
                encode(message.locksroot, 32),
              ]),
            );
      return hexlify(
        concat([
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(1, 32), // raiden_contracts.constants.MessageTypeId.BALANCE_PROOF
          encode(message.channel_identifier, 32),
          encode(balanceHash, 32), // balance hash
          encode(message.nonce, 32),
          encode(messageHash, 32), // additional hash
        ]),
      );
    default:
      // place-holder error for type safety while this function isn't fully implemented
      throw new Error('Non-encodable message');
  }
}
