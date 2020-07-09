import { Router, Request, Response, NextFunction } from 'express';
import { ErrorCodes, RaidenError, RaidenTransfer } from 'raiden-ts';
import { timer } from 'rxjs';
import { toArray, takeUntil, first } from 'rxjs/operators';
import { Cli } from '../types';
import { validateAddressParameter, isInvalidParameterError } from '../utils/validation';
import { transformSdkTransferToApiPayment } from '../utils/payments';

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

async function getPaymentsForTokenAndEnd(this: Cli, request: Request, response: Response) {
  const allTransfers = await this.raiden.transfers$
    .pipe(takeUntil(timer(0)), toArray())
    .toPromise();
  const filteredTransfers = allTransfers.filter(
    (transfer) =>
      transfer.token === request.params.tokenAddress &&
      (transfer.target === request.params.endAddress ||
        transfer.initiator === request.params.endAddress),
  );
  const payments = filteredTransfers.map(transformSdkTransferToApiPayment);
  response.json(payments);
}

async function doTransfer(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    // TODO: We ignore the provided `lock_timeout` until #1710 provides a better solution
    const transferKey = await this.raiden.transfer(
      request.params.tokenAddress,
      request.params.targetAddress,
      request.body.amount,
      { paymentId: request.body.identifier },
    );
    await this.raiden.waitTransfer(transferKey);
    const newTransfer = await this.raiden.transfers$
      .pipe(first(({ key }: RaidenTransfer) => key === transferKey))
      .toPromise();
    response.send(transformSdkTransferToApiPayment(newTransfer));
  } catch (error) {
    if (isInvalidParameterError(error)) {
      response.status(400).send(error.message);
    } else if (isConflictError(error)) {
      const pfsErrorDetail = error.details?.errors ? ` (${error.details.errors})` : '';
      response.status(409).send(error.message + pfsErrorDetail);
    } else {
      next(error);
    }
  }
}

export function makePaymentsRouter(this: Cli): Router {
  const router = Router();

  // end is either initiator (for received transfers) or target (for sent)
  router.get(
    '/:tokenAddress/:endAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('endAddress'),
    getPaymentsForTokenAndEnd.bind(this),
  );

  router.post(
    '/:tokenAddress/:targetAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('targetAddress'),
    doTransfer.bind(this),
  );

  return router;
}
