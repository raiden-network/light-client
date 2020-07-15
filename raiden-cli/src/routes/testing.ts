import { Router, Request, Response, NextFunction } from 'express';
import { ErrorCodes } from 'raiden-ts';
import { validateAddressParameter } from '../utils/validation';
import { Cli } from '../types';

async function mintTokens(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const transactionHash = await this.raiden.mint(
      request.params.tokenAddress,
      request.body.value,
      { to: request.body.to },
    );
    response.json({ transaction_hash: transactionHash });
  } catch (error) {
    if ([ErrorCodes.DTA_INVALID_ADDRESS, ErrorCodes.DTA_INVALID_AMOUNT].includes(error.message))
      response.status(400).send(error.message);
    else next(error);
  }
}

export function makeTestingRouter(this: Cli): Router {
  const router = Router();

  router.post(
    '/tokens/:tokenAddress/mint',
    validateAddressParameter.bind('tokenAddress'),
    mintTokens.bind(this),
  );

  return router;
}
