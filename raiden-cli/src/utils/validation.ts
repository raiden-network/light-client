import type { NextFunction, Request, Response } from 'express';

import type { RaidenError } from 'raiden-ts';
import { Address, ErrorCodes } from 'raiden-ts';

/**
 * Validate bound string is a valid address in request's params
 *
 * @param this - Parameter name
 * @param request - Check param on this request
 * @param response - Fill this response in case of failure
 * @param next - Callback
 */
export function validateAddressParameter(
  this: string,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const addressParameter = request.params[this];

  if (!Address.is(addressParameter)) {
    response
      .status(404)
      .send(`The given address '${addressParameter}' is not valid eip55-encoded Ethereum address`);
  } else {
    next();
  }
}

/**
 * Validate bound string is a valid address in request's params, optionally
 *
 * @param this - Parameter name
 * @param request - Check param on this request
 * @param response - Fill this response in case of failure
 * @param next - Callback
 */
export function validateOptionalAddressParameter(
  this: string,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (!request.params[this]) next();
  else validateAddressParameter.call(this, request, response, next);
}

/**
 * Checks an error is an InvalidParameter error
 *
 * @param error - Error to test
 * @returns True if error is one of InvalidParameter errors
 */
export function isInvalidParameterError(error: RaidenError): boolean {
  return [
    ErrorCodes.DTA_NEGATIVE_NUMBER,
    ErrorCodes.DTA_NUMBER_TOO_LARGE,
    ErrorCodes.DTA_ARRAY_LENGTH_DIFFERENCE,
    ErrorCodes.DTA_UNENCODABLE_DATA,
    ErrorCodes.DTA_NON_POSITIVE_NUMBER,
    ErrorCodes.DTA_INVALID_ADDRESS,
    ErrorCodes.DTA_INVALID_TIMEOUT,
    ErrorCodes.DTA_INVALID_PAYMENT_ID,
    ErrorCodes.DTA_INVALID_PATH,
    ErrorCodes.DTA_INVALID_PFS,
  ].includes(error.message);
}

/**
 * This checks for a typical error message pattern that gets thrown by EthersJS.
 * It occurs while trying to estimate the amount of gas for a transaction.
 * For the use-case here this usually means that the parameter for the contracts
 * function call lead to a failing require statement. An example would be
 * insufficient tokens funds for depositing.
 *
 * @param error - Error to test
 * @returns True if error is a TransactionWoulfFail error
 */
export function isTransactionWouldFailError(error: Error): boolean {
  return /always failing transaction/.test(error.message);
}

/**
 * Checks if error is related to a failed transfer
 *
 * @param error - Error to test
 * @returns True if error signals failed transfer
 */
export function isTransferFailedError(error: Error): boolean {
  return [
    ErrorCodes.XFER_ALREADY_COMPLETED,
    ErrorCodes.XFER_CHANNEL_CLOSED_PREMATURELY,
    ErrorCodes.XFER_EXPIRED,
    ErrorCodes.XFER_INVALID_SECRETREQUEST,
    ErrorCodes.XFER_REFUNDED,
    ErrorCodes.XFER_REGISTERSECRET_TX_FAILED,
  ].includes(error.message);
}

/**
 * @param error - Error to test
 * @returns True if error is a Conflict error
 */
export function isConflictError(error: Error): boolean {
  return (
    [
      ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK,
      ErrorCodes.CNL_INVALID_STATE,
      ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND,
      ErrorCodes.DTA_INVALID_DEPOSIT,
      ErrorCodes.DTA_INVALID_AMOUNT,
    ].includes(error.message) || isTransactionWouldFailError(error)
  );
}

/**
 * @param error - Error to test
 * @param error.message - Error message
 * @param error.code - Error code
 * @returns True if error is an InsufficientFunds error
 */
export function isInsuficientFundsError(error: {
  message: string;
  code?: string | number;
}): boolean {
  return (
    error.code === 'INSUFFICIENT_FUNDS' ||
    [
      ErrorCodes.RDN_INSUFFICIENT_BALANCE,
      ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_LOW,
      ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_HIGH,
    ].includes(error.message)
  );
}
