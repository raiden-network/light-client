import { Router, Request, Response } from 'express';
import { Cli } from '../types';
import { validate, isAddress } from '../utils/validation';

export function makePendingTransfersRouter(this: Cli): Router {
  const router = Router();

  router.get('/', function (_request: Request, response: Response): void {
    response.status(404).send('Not implemented yet');
  });

  router.get('/:tokenAddress', validate([isAddress('tokenAddress', 'params')]), function (
    _request: Request,
    response: Response,
  ): void {
    response.status(404).send('Not implemented yet');
  });

  router.get(
    '/:tokenAddress/:partnerAddress',
    validate([isAddress('tokenAddress', 'params'), isAddress('targetAddress', 'params')]),
    function (_request: Request, response: Response): void {
      response.status(404).send('Not implemented yet');
    },
  );

  return router;
}
