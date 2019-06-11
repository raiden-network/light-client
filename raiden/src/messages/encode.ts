// import * as t from 'io-ts';
import { bigNumberify, concat, hexlify, hexZeroPad } from 'ethers/utils';

import { Bytes } from '../store/types';
import { Delivered, Messages, MessageType } from './types';

export const CMDIDs: { [T in MessageType]: number } = {
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
 * Pack a message in a hex-string format, **without** signature
 * This packed hex-byte-array can then be used for signing.
 */
export function packMessage(message: Messages): Bytes {
  if (Delivered.is(message)) {
    return hexlify(
      concat([
        bigNumberify(CMDIDs[message.type]).toHexString(), // 1B
        '0x000000', // pad(3)==3B
        // hexZeroPad == leftPad == big-endian
        hexZeroPad(bigNumberify(message.delivered_message_identifier).toHexString(), 8), // 8B
      ]),
    );
  }
  // place-holder error for type safety while this function not fully implmeneted
  throw new Error('Non-encodable message');
}
