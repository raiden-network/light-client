import { Router, Request, Response, NextFunction } from 'express';
import { ErrorCodes, RaidenError, RaidenTransfer } from 'raiden-ts';
import { timer } from 'rxjs';
import { toArray, takeUntil, filter, map } from 'rxjs/operators';
import { Cli } from '../types';
import {
  validateAddressParameter,
  isInvalidParameterError,
  validateOptionalAddressParameter,
  isInsuficientFundsError,
  isTransferFailedError,
} from '../utils/validation';

export enum ApiPaymentEvent {
  sent = 'EventPaymentSentSuccess',
  received = 'EventPaymentReceivedSuccess',
}

export interface ApiPayment {
  event: ApiPaymentEvent;
  initiator_address: string;
  target_address: string;
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
    initiator_address: transfer.initiator,
    target_address: transfer.target,
    token_address: transfer.token,
    amount: transfer.value.toString(),
    identifier: transfer.paymentId.toString(),
    secret: transfer.secret ?? '',
    secret_hash: transfer.secrethash,
    log_time: transfer.changedAt.toISOString(),
  };
}

function isConflictError(error: RaidenError): boolean {
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
  ].includes(error.message);
}

function getPayments(this: Cli, request: Request, response: Response) {
  this.raiden.transfers$
    .pipe(
      filter((t) => !request.params.tokenAddress || request.params.tokenAddress === t.token),
      filter(
        (t) =>
          !request.params.endAddress ||
          request.params.endAddress === t.target ||
          request.params.endAddress === t.initiator,
      ),
      takeUntil(timer(0)),
      map(transformSdkTransferToApiPayment),
      toArray(),
    )
    .subscribe((payments) => response.json(payments));
}

async function doTransfer(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const transferKey = await this.raiden.transfer(
      request.params.tokenAddress,
      request.params.targetAddress,
      request.body.amount.toString(),
      { paymentId: request.body.identifier?.toString(), lockTimeout: request.body.lock_timeout },
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
      const pfsErrorDetail = error.details?.errors ? ` (${error.details.errors})` : '';
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
