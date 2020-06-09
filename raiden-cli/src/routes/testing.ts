import { Router, Request, Response } from 'express';
import { Cli } from '../types';
import { validate, isAddress, isAmount } from '../utils/validation';

export function makeTestingRouter(this: Cli): Router {
  const router = Router();

  router.get(
    '/tokens/:tokenAddress/mint',
    validate([
      isAddress('tokenAddress', 'params'),
      isAddress('to', 'body'),
      isAmount('value', 'body'),
    ]),
    function (_request: Request, response: Response): void {
      response.status(404).send('Not implemented yet');
    },
  );

  return router;
}
