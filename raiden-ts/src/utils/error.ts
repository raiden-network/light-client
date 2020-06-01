import * as t from 'io-ts';
import { map } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import findKey from 'lodash/findKey';

export enum ErrorCodes {
  // Path errors
  PFS_EMPTY_URL = 'A registered Pathfinding Service returned an empty service URL.',
  PFS_INVALID_URL = 'A registered Pathfinding Service returned an invalid service URL.',
  PFS_INVALID_INFO = 'Could not find any valid Pathfinding service. Client and PFS versions are possibly out-of-sync.',
  PFS_NO_ROUTES_FOUND = 'No valid routes found.',
  PFS_ERROR_RESPONSE = 'Pathfinding Service request returned an error',
  PFS_DISABLED = 'Pathfinding Service is disabled and no direct route is available.',
  PFS_UNKNOWN_TOKEN_NETWORK = 'No open channels on this token network.',
  PFS_TARGET_OFFLINE = 'The requested target is offline.',
  PFS_TARGET_NO_RECEIVE = "The requested target doesn't receive transfers.",
  PFS_LAST_IOU_REQUEST_FAILED = 'The request for the last IOU has failed.',
  PFS_IOU_SIGNATURE_MISMATCH = 'The signature of the last IOU did not match.',
  PFS_NO_ROUTES_BETWEEN_NODES = 'No route between nodes found.',

  // Channel errors
  CNL_INVALID_STATE = 'Invalid channel state.',
  CNL_NO_OPEN_CHANNEL_FOUND = 'No open channel has been found.',
  CNL_NO_OPEN_OR_CLOSING_CHANNEL_FOUND = 'No open or closing channel has been found.',
  CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND = 'No settleable or settling channel has been found.',
  CNL_APPROVE_TRANSACTION_FAILED = 'Token approve transaction failed.',
  CNL_OPENCHANNEL_FAILED = 'Token networks openChannel transaction failed.',
  CNL_SETTOTALDEPOSIT_FAILED = 'Token networks setTotalDeposit transaction failed.',
  CNL_CLOSECHANNEL_FAILED = 'Token networks closeChannel transaction failed.',
  CNL_SETTLECHANNEL_FAILED = 'Token networks settleChannel transaction failed.',
  CNL_UPDATE_NONCLOSING_BP_FAILED = 'updateNonClosingBalanceProof transaction failed.',
  CNL_ONCHAIN_UNLOCK_FAILED = 'on-chain unlock transaction failed.',

  // Transfer errors
  XFER_EXPIRED = 'Transfer expired.',
  XFER_CHANNEL_CLOSED_PREMATURELY = 'Channel was closed before secret got reveiled or transfer unlocked.',
  XFER_REFUNDED = 'Transfer has been refunded.',
  XFER_INVALID_SECRETREQUEST = 'Invalid SecretRequest received',
  XFER_ALREADY_COMPLETED = "Not waiting for transfer, it's already completed.",
  XFER_REGISTERSECRET_TX_FAILED = 'SecretRegistry.registerSecret transaction failed',

  // Transport errors
  TRNS_NO_MATRIX_SERVERS = 'Could not contact any Matrix servers.',
  TRNS_NO_VALID_USER = 'Could not find a user with a valid signature.',
  TRNS_NO_SERVERNAME = 'Could not get server name from Matrix server.',
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
  RDN_TRANSACTION_REORG = 'Transaction has been mined but got removed by a reorg.',
  RDN_STATE_MIGRATION = 'Could not replace stored state with older, provided state.',

  // Data errors
  DTA_NEGATIVE_NUMBER = 'Encountered negative number while encoding to HEX string.',
  DTA_NUMBER_TOO_LARGE = 'Encountered a number that is too large to be encoded.',
  DTA_ARRAY_LENGTH_DIFFRENCE = 'Expected length of HEX string differs from integer array input.',
  DTA_UNENCODABLE_DATA = 'Passed data is not a HEX string nor integer array.',
}

export const ErrorDetails = t.record(t.string, t.union([t.string, t.number, t.boolean, t.null]));
export interface ErrorDetails extends t.TypeOf<typeof ErrorDetails> {}

export class RaidenError extends Error {
  public name = 'RaidenError';
  private _code: string | undefined = undefined;

  public constructor(message?: ErrorCodes, public details: ErrorDetails = {}) {
    super(message ?? ErrorCodes.RDN_GENERAL_ERROR);
    Object.setPrototypeOf(this, RaidenError.prototype);
  }

  public get code(): string {
    // to need to search for _code before first access
    if (this._code === undefined)
      this._code =
        findKey(ErrorCodes, (message) => message === this.message) ?? 'RDN_GENERAL_ERROR';
    return this._code;
  }
}

const serializedErr = t.intersection([
  t.type({ name: t.string }),
  t.partial({ message: t.string, stack: t.string, details: ErrorDetails }),
]);

/**
 * Simple Error codec
 *
 * This codec doesn't decode to an instance of the exact same error class object, but instead to
 * a generic Error, but assigning 'name', 'stack' & 'message' properties, more as an informative
 * object.
 */
export const ErrorCodec = new t.Type<
  Error,
  { name: string; message?: string; stack?: string; details?: ErrorDetails }
>(
  'Error',
  // if it quacks like a duck... without relying on instanceof
  (u: unknown): u is Error => typeof u === 'object' && !!u && 'name' in u && 'message' in u,
  (u) =>
    pipe(
      serializedErr.decode(u),
      map((error) => {
        if ('details' in error) {
          return Object.assign(new RaidenError(error.message as ErrorCodes, error.details), {
            name: error.name,
            stack: error.stack,
          });
        } else {
          return Object.assign(new Error(error.message), { name: error.name, stack: error.stack });
        }
      }),
    ),
  (error: RaidenError | Error) => ({
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...('details' in error ? { details: error.details } : {}),
  }),
);
