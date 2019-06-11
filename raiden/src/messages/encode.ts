// import * as t from 'io-ts';
import { BigNumber, bigNumberify } from 'ethers/utils';
import { Arrayish, arrayify, concat, hexlify, isArrayish, padZeros } from 'ethers/utils/bytes';

import { BigNumberC, Bytes } from '../store/types';
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
 * @param message Message to be packed
 * @returns HexBytes hex-encoded string data representing message in binary format
 */
export function packMessage(message: Message): Bytes {
  switch (message.type) {
    case MessageType.DELIVERED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.delivered_message_identifier, 8),
        ]),
      );
    default:
      // place-holder error for type safety while this function isn't fully implemented
      throw new Error('Non-encodable message');
  }
}
