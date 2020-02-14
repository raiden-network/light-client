import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import { CustomError } from 'ts-custom-error';

export enum ErrorCodes {
  PFS_EMPTY_URL = 'A registered Pathfinding Service returned an empty service URL.',
  PFS_INVALID_URL = 'A registered Pathfinding Service returned an invalid service URL.',
  PFS_INVALID_INFO = 'Could not any valid Pathfinding services. Client and PFS versions are possibly out-of-sync.',
  PFS_NO_ROUTES_FOUND = 'No valid routes found.',
  PFS_ERROR_RESPONSE = 'Pathfinding Service request returned an error',
  PFS_DISABLED = 'Pathfinding Service is disabled and no direct route is available.',
  PFS_UNKNOWN_TOKEN_NETWORK = 'Unknown token network.',
  PFS_TARGET_OFFLINE = 'The requested target is offline.',
  PFS_LAST_IOU_REQUEST_FAILED = 'The request for the last IOU has failed.',
  PFS_IOU_SIGNATURE_MISMATCH = 'The signature of the last IOU did not match.',
}

export const ErrorDetails = t.array(t.record(t.string, t.union([t.string, t.number])));
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export default class RaidenError extends CustomError {
  public code: string;
  message: string;

  public constructor(message: ErrorCodes, public details?: ErrorDetails) {
    super(message ?? 'General Error');
    this.message = message;
    this.code = this.getCode(message);
  }

  getCode(message: string): string {
    return (
      Object.keys(ErrorCodes).find(code => Object(ErrorCodes)[code] === message) ??
      'RAIDEN_GENERAL_ERROR'
    );
  }
}

const serializedErr = t.intersection([
  t.type({ name: t.string, message: t.string, code: t.string }),
  t.partial({ stack: t.string, details: ErrorDetails }),
]);

/**
 * Simple Error codec
 *
 * This codec doesn't decode to an instance of the exact same error class object, but instead to
 * a generic Error, but assigning 'name', 'stack' & 'message' properties, more as an informative
 * object.
 */
export const ErrorCodec = new t.Type<
  RaidenError,
  { name: string; message: string; code: string; stack?: string; details?: ErrorDetails }
>(
  'RaidenError',
  (u: unknown): u is RaidenError => u instanceof RaidenError,
  u => {
    return pipe(
      serializedErr.decode(u),
      map(({ name, message, code, stack, details }) => {
        return Object.assign(new RaidenError(message as ErrorCodes, details), {
          name,
          code,
          stack,
          message,
        });
      }),
    );
  },
  ({ name, message, stack, details, code }: RaidenError) => {
    console.error('$$$$', message);
    return {
      name,
      message,
      stack,
      code,
      details,
    };
  },
);
