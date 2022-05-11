import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import type { RaidenError, RaidenTransfer } from 'raiden-ts';
import { ErrorCodes } from 'raiden-ts';

import type { Cli } from '../types';
import {
  isInsuficientFundsError,
  isInvalidParameterError,
  isTransferFailedError,
  queryAsNumbers,
  validateAddressParameter,
  validateOptionalAddressParameter,
} from '../utils/validation';

enum ApiPaymentEvent {
  sent = 'EventPaymentSentSuccess',
  received = 'EventPaymentReceivedSuccess',
}

interface ApiPayment {
  event: ApiPaymentEvent;
  initiator: string;
  target: string;
  token_address: string;
  amount: string;
  identifier: string;
  secret: string;
  secret_hash: string;
  log_time: string;
}

function transformSdkTransferToApiPayment(transfer: RaidenTransfer): ApiPayment {
  // TODO: The payment object representation of the API spec is not clear
  // enough. We need to clarify this and agree on a single representation.
  return {
    event: ApiPaymentEvent[transfer.direction],
    initiator: transfer.initiator,
    target: transfer.target,
    token_address: transfer.token,
    amount: transfer.value.toString(),
    identifier: transfer.paymentId.toString(),
    secret: transfer.secret ?? '',
    secret_hash: transfer.secrethash,
    log_time: transfer.startedAt.toISOString().slice(0, 23),
  };
}

function isConflictError(error: unknown): error is RaidenError {
  return [
    ErrorCodes.PFS_INVALID_INFO,
    ErrorCodes.PFS_NO_ROUTES_FOUND,
    ErrorCodes.PFS_ERROR_RESPONSE,
    ErrorCodes.PFS_DISABLED,
    ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK,
    ErrorCodes.PFS_TARGET_OFFLINE,
    ErrorCodes.PFS_TARGET_NO_RECEIVE,
    ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED,
    ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH,
    ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
  ].includes((error as Error).message);
}

function getPayments(this: Cli, request: Request, response: Response) {
  let filter: Parameters<typeof this.raiden['getTransfers']>[0];
  if (request.params.tokenAddress) {
    filter = { token: request.params.tokenAddress };
    if (request.params.endAddress) filter['end'] = request.params.endAddress;
  }

  this.raiden
    .getTransfers(filter, queryAsNumbers(request.query))
    .then((transfers) => transfers.map(transformSdkTransferToApiPayment))
    .then(
      (r) => response.json(r),
      (e) => {
        this.log.error(e);
        response.status(400).send(e);
      },
    );
}

async function doTransfer(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const transferKey = await this.raiden.transfer(
      request.params.tokenAddress,
      request.params.targetAddress,
      request.body.amount.toString(),
      {
        ...request.body,
        paymentId: request.body.identifier?.toString(),
        lockTimeout: request.body.lock_timeout,
      },
    );
    const transfer = await this.raiden.waitTransfer(transferKey);
    response.send(transformSdkTransferToApiPayment(transfer));
  } catch (error) {
    if (isInvalidParameterError(error)) {
      response.status(400).send(error.message);
    } else if (isInsuficientFundsError(error)) {
      response.status(402).send(error.message);
    } else if (isTransferFailedError(error)) {
      response.status(409).send(error.message);
    } else if (isConflictError(error)) {
      const errors = (error.details as { errors: string } | undefined)?.errors;
      const pfsErrorDetail = errors ? ` (${errors})` : '';
      response.status(409).json({ message: error.message, details: pfsErrorDetail });
    } else {
      next(error);
    }
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makePaymentsRouter(this: Cli): Router {
  const router = Router();

  // end is either initiator (for received transfers) or target (for sent)
  router.get(
    '/:tokenAddress?/:endAddress?',
    validateOptionalAddressParameter.bind('tokenAddress'),
    validateOptionalAddressParameter.bind('endAddress'),
    getPayments.bind(this),
  );

  router.post(
    '/:tokenAddress/:targetAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('targetAddress'),
    doTransfer.bind(this),
  );

  return router;
}
