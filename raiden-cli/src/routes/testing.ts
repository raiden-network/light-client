import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import type { Cli } from '../types';
import { isInvalidParameterError, validateAddressParameter } from '../utils/validation';

async function mintTokens(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const transactionHash = await this.raiden.mint(
      request.params.tokenAddress,
      request.body.value,
      { to: request.body.to },
    );
    response.json({ transaction_hash: transactionHash });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeTestingRouter(this: Cli): Router {
  const router = Router();

  router.post(
    '/tokens/:tokenAddress/mint',
    validateAddressParameter.bind('tokenAddress'),
    mintTokens.bind(this),
  );

  return router;
}
