/* eslint-disable @typescript-eslint/no-explicit-any */
import { Zero, One, Two } from '@ethersproject/constants';
import { BigNumber } from '@ethersproject/bignumber';
import { toUtf8Bytes } from '@ethersproject/strings';
import {
  BytesLike,
  isBytesLike,
  Hexable,
  hexlify,
  hexZeroPad,
  hexDataLength,
  isHexString,
} from '@ethersproject/bytes';
import JSONbig from 'json-bigint';

import { BigNumberC, HexString } from './types';
import { RaidenError, ErrorCodes } from './error';

/**
 * Encode data to hex string of exactly length size (in bytes)
 * Throw if data can't be made to fit in length.
 *
 * @param data - May be of multiple types:
 *      - number|BigNumber: Encoded in the big-endian byte-order and left-zero-padded to length
 *      - string: Must be hex-encoded string of length bytes
 *      - number[] Must be of exactly of length size (left/right-pad it before if needed)
 * @param length - The expected length of the hex string, in bytes
 * @returns HexString byte-array of length
 */
export function encode<S extends number = number>(
  data: boolean | number | Hexable | BytesLike,
  length: S,
): HexString<S> {
  let hex: HexString<S>;
  if (typeof data === 'boolean') data = data ? One : Zero;
  else if (typeof data === 'number') data = BigNumber.from(data);
  if (typeof data === 'string' && !isHexString(data)) data = toUtf8Bytes(data);
  if (isBytesLike(data)) data = hexlify(data);

  if (BigNumberC.is(data)) {
    if (data.lt(0)) throw new RaidenError(ErrorCodes.DTA_NEGATIVE_NUMBER);
    if (data.gte(Two.pow(length * 8))) throw new RaidenError(ErrorCodes.DTA_NUMBER_TOO_LARGE);
    hex = hexZeroPad(hexlify(data), length) as HexString<S>;
  } else if (typeof data === 'string') {
    if (hexDataLength(data) !== length)
      throw new RaidenError(ErrorCodes.DTA_ARRAY_LENGTH_DIFFERENCE);
    hex = data as HexString<S>;
  } else {
    throw new RaidenError(ErrorCodes.DTA_UNENCODABLE_DATA);
  }
  return hex;
}

// storeAsString requires BigNumbers to be decoded by io-ts
const JSONbigStr = JSONbig({ storeAsString: true });
export const jsonParse = JSONbigStr.parse;
export const jsonStringify = JSONbigStr.stringify;
