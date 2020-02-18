import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import { CustomError } from 'ts-custom-error';

export enum ErrorCodes {
  // Path errors
  PFS_EMPTY_URL = 'A registered Pathfinding Service returned an empty service URL.',
  PFS_INVALID_URL = 'A registered Pathfinding Service returned an invalid service URL.',
  PFS_INVALID_INFO = 'Could not find any valid Pathfinding service. Client and PFS versions are possibly out-of-sync.',
  PFS_NO_ROUTES_FOUND = 'No valid routes found.',
  PFS_ERROR_RESPONSE = 'Pathfinding Service request returned an error',
  PFS_DISABLED = 'Pathfinding Service is disabled and no direct route is available.',
  PFS_UNKNOWN_TOKEN_NETWORK = 'Unknown token network.',
  PFS_TARGET_OFFLINE = 'The requested target is offline.',
  PFS_LAST_IOU_REQUEST_FAILED = 'The request for the last IOU has failed.',
  PFS_IOU_SIGNATURE_MISMATCH = 'The signature of the last IOU did not match.',

  // Channel errors
  CNL_INVALID_STATE = 'Invalid channel state.',
  CNL_TOKEN_NOT_FOUND = 'Could not find token for token network.',
  CNL_NO_OPEN_CHANNEL_FOUND = 'No open channel has been found.',
  CNL_NO_OPEN_OR_CLOSING_CHANNEL_FOUND = 'No open or closing channel has been found.',
  CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND = 'No settleable or settling channel has been found.',
  CNL_APPROVE_TRANSACTION_FAILED = 'Token approve transaction failed.',
  CNL_OPENCHANNEL_FAILED = 'Token networks openChannel transaction failed.',
  CNL_SETTOTALDEPOSIT_FAILED = 'Token networks setTotalDeposit transaction failed.',
  CNL_CLOSECHANNEL_FAILED = 'Token networks closeChannel transaction failed.',
  CNL_SETTLECHANNEL_FAILED = 'Token networks settleChannel transaction failed.',

  // Transfer errors
  XFER_EXPIRED = 'Transfer expired.',
  XFER_CHANNEL_CLOSED_PREMATURELY = 'Channel was closed before secret got reveiled or transfer unlocked.',
  XFER_REFUNDED = 'Transfer has been refunded.',

  // Transport errors
  TRNS_NO_VALID_USER = 'Could not find a user with a valid signature.',
  TRNS_NO_SERVERNAME = 'Could not get server name from Matrix server.',
  TRNS_NO_DISPLAYNAME = 'Could not get display name from Matrix server.',
  TRNS_USERNAME_VERIFICATION_FAILED = 'Could not verify the signature of a display name.',
  TRNS_MESSAGE_SIGNATURE_MISMATCH = 'Unable to decode message due to signature mismatch.',

  // Raiden main class errors
  RDN_GENERAL_ERROR = 'An unknown error occured.',
  RDN_MINT_FAILED = 'Failed to mint tokens.',
  RDN_APPROVE_TRANSACTION_FAILED = 'Approve transaction has failed.',
  RDN_DEPOSIT_TRANSACTION_FAILED = 'Deposit transaction has failed.',
  RDN_TRANSFER_ONCHAIN_BALANCE_FAILED = 'Failed to transfer on-chain balance.',
  RDN_TRANSFER_ONCHAIN_TOKENS_FAILED = 'Failed to transfer on-chain tokens.',
  RDN_UNRECOGNIZED_NETWORK = 'No deploy info provided nor recognized network.',
  RDN_SIGNER_NOT_CONNECTED = 'The signing account is not connected to the provider.',
  RDN_ACCOUNT_NOT_FOUND = 'Account not found in provider.',
  RDN_STRING_ACCOUNT_INVALID = 'String account must be either a 0x-encoded address or private key.',
  RDN_TRANSACTION_REOGRG = 'Transaction has been mined but got removed by a reorg.',
  RDN_STATE_MIGRATION = 'Could not replace stored state with older, provided state.',

  // Data errors
  DTA_NEGATIVE_NUMBER = 'Encountered negative number while encoding to HEX string.',
  DTA_NUMBER_TOO_LARGE = 'Encountered a number that is too large to be encoded.',
  DTA_ARRAY_LENGTH_DIFFRENCE = 'Expected length of HEX string differs from integer array input.',
  DTA_UNENCODABLE_DATA = 'Passed data is not a HEX string nor integer array.',
}

export const ErrorDetails = t.array(t.record(t.string, t.union([t.string, t.number])));
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export default class RaidenError extends CustomError {
  public code: string;

  public constructor(message: ErrorCodes, public details?: ErrorDetails) {
    super(message ?? ErrorCodes.RDN_GENERAL_ERROR);
    this.code = this.getCode(message);
  }

  private getCode(message: string): string {
    return (
      Object.keys(ErrorCodes).find(code => Object(ErrorCodes)[code] === message) ||
      'RDN_GENERAL_ERROR'
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
      map(({ message, code, stack, details }) =>
        Object.assign(new RaidenError(message as ErrorCodes, details), {
          code,
          stack,
          message,
          details,
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
