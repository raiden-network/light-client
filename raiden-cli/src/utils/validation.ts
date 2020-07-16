import { Request, Response, NextFunction } from 'express';
import { Address, RaidenError, ErrorCodes } from 'raiden-ts';

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

export function validateOptionalAddressParameter(
  this: string,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (!request.params[this]) next();
  else validateAddressParameter.call(this, request, response, next);
}

export function isInvalidParameterError(error: RaidenError): boolean {
  return [
    ErrorCodes.DTA_NEGATIVE_NUMBER,
    ErrorCodes.DTA_NUMBER_TOO_LARGE,
    ErrorCodes.DTA_ARRAY_LENGTH_DIFFERENCE,
    ErrorCodes.DTA_UNENCODABLE_DATA,
    ErrorCodes.DTA_NON_POSITIVE_NUMBER,
    ErrorCodes.DTA_INVALID_ADDRESS,
    ErrorCodes.DTA_INVALID_DEPOSIT,
    ErrorCodes.DTA_INVALID_TIMEOUT,
    ErrorCodes.DTA_INVALID_AMOUNT,
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
 */
export function isTransactionWouldFailError(error: Error): boolean {
  return /always failing transaction/.test(error.message);
}

export function isConflictError(error: Error): boolean {
  return (
    [ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, ErrorCodes.CNL_INVALID_STATE].includes(error.message) ||
    isTransactionWouldFailError(error)
  );
}

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
