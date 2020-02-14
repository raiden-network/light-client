import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import { CustomError } from 'ts-custom-error';

export enum ErrorCodes {
  // Path errors
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

  // Channel errors
  CNL_INVALID_STATE = 'Invalid channel state.',
  CNL_TOKEN_NOT_FOUND = 'Could not find tken for token network.',
  CNL_NO_OPEN_CHANNEL_FOUND = 'No open channel has been found.',
  CNL_NO_OPEN_OR_CLOSING_CHANNEL_FOUND = 'No open or closing channel has been found.',
  CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND = 'No settleable or settling channel has been found.',
  CNL_APPROVE_TRANSACTION_FAILED = 'Token approve transaction failed.',
  CNL_SETTOTALDEPOSIT_FAILED = 'Token networks setTotalDeposit transaction failed.',
  CNL_CLOSECHANNEL_FAILED = 'Token networks closeChannel transaction failed.',
  CNL_SETTLECHANNEL_FAILED = 'Token networks settleChannel transaction failed.',

  // Transfer errors
  XFER_EXPIRED = 'Transfer expired.',
  XFER_CHANNEL_CLOSED_PREMATURELY = 'Channel was closed before secret got reveiled or transfer unlocked.',
  XFER_REFUNDED = 'Transfer has been refunded.',
}

export const ErrorDetails = t.array(t.record(t.string, t.union([t.string, t.number])));
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export default class RaidenError extends CustomError {
  public code: string;

  public constructor(message: ErrorCodes, public details?: ErrorDetails) {
    super(message ?? 'General Error');
    this.code = this.getCode(message);
  }

  private getCode(message: string): string {
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
  u =>
    pipe(
      serializedErr.decode(u),
      map(({ name, message, code, stack, details }) =>
        Object.assign(new RaidenError(message as ErrorCodes, details), {
          name,
          code,
          stack,
          message,
        }),
      ),
    ),
  ({ name, message, stack, details, code }: RaidenError) => ({
    name,
    message,
    stack,
    code,
    details,
  }),
);
