import { Router, Request, Response } from 'express';
import { Cli } from '../types';
import { validate, isAddress, isTimeout, isIdentifier, isAmount } from '../utils/validation';

export function makePaymentsRouter(this: Cli): Router {
  const router = Router();

  router.get(
    '/:tokenAddress/:targetAddress',
    validate([isAddress('tokenAddress', 'params'), isAddress('targetAddress', 'params')]),
    function (_request: Request, response: Response): void {
      response.status(404).send('Not implemented yet');
    },
  );

  router.post(
    '/:tokenAddress/:targetAddress',
    validate([
      isAddress('tokenAddress', 'params'),
      isAddress('targetAddress', 'params'),
      isAmount('amount', 'body'),
      isIdentifier('identifier', 'body', true),
      isTimeout('lock_timeout', 'body', true),
    ]),
    function (request: Request, response: Response): void {
      response.status(404).send('Not implemented yet');
    },
  );

  return router;
}
