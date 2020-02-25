/* eslint-disable @typescript-eslint/no-explicit-any */
import { Two } from 'ethers/constants';
import { BigNumber, bigNumberify } from 'ethers/utils';
import { Arrayish, hexlify, isArrayish, hexZeroPad, hexDataLength } from 'ethers/utils/bytes';
import * as LosslessJSON from 'lossless-json';

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
  data: number | string | Arrayish | BigNumber,
  length: S,
): HexString<S> {
  let hex: HexString<S>;
  if (typeof data === 'number') data = bigNumberify(data);
  if (BigNumberC.is(data)) {
    if (data.lt(0)) throw new RaidenError(ErrorCodes.DTA_NEGATIVE_NUMBER);
    if (data.gte(Two.pow(length * 8))) throw new RaidenError(ErrorCodes.DTA_NUMBER_TOO_LARGE);
    hex = hexZeroPad(hexlify(data), length) as HexString<S>;
  } else if (typeof data === 'string' || isArrayish(data)) {
    const str = hexlify(data);
    if (hexDataLength(str) !== length)
      throw new RaidenError(ErrorCodes.DTA_ARRAY_LENGTH_DIFFRENCE);
    hex = str as HexString<S>;
  } else {
    throw new RaidenError(ErrorCodes.DTA_UNENCODABLE_DATA);
  }
  return hex;
}

const isLosslessNumber = (u: unknown): u is LosslessJSON.LosslessNumber =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u != null && (u as any)['isLosslessNumber'];
/**
 * Opportunistic JSON.parse regarding numbers
 * If possible to decode a JSON number as JS number (i.e. value < 2^53) and return 'number',
 * otherwise returns BigNumber object
 * Throws if handled invalid JSON
 *
 * @param text - JSON string to parse
 * @returns Decoded object
 */
export function losslessParse(text: string): any {
  return LosslessJSON.parse(text, ({}, value) => {
    if (isLosslessNumber(value)) {
      try {
        return value.valueOf(); // return number, if possible, or throw if > 2^53
      } catch (e) {
        // else, convert early to BigNumber
        return bigNumberify(value.toString());
      }
    }
    return value;
  });
}

/**
 * Stringify object losslessly, by converting BigNumbers to 'string's
 *
 * @param value - Object to be serialized as a string
 * @param replacer - Replacer function. Leave default to stringify BigNumbers
 * @param space - indentation spaces
 * @returns serialized representation of value
 */
export function losslessStringify(
  value: any,
  replacer: ((key: string, value: any) => any) | (string | number)[] = ({}, value: any) =>
    BigNumber.isBigNumber(value) ? value.toString() : value,
  space?: string | number,
) {
  return LosslessJSON.stringify(value, replacer, space);
}
