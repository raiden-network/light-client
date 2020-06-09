import { Router, Request, Response } from 'express';
import { Cli } from '../types';
import { validate, isAddress, isAmount, isFraction } from '../utils/validation';

export function makeConnectionsRouter(this: Cli): Router {
  const router = Router();

  router.get('/', function (_request: Request, response: Response): void {
    response.send('All connections');
  });

  router.put(
    '/:tokenAddress',
    validate([
      isAddress('tokenAddress', 'params'),
      isAmount('funds', 'body'),
      isAmount('initital_channel_target', 'body', true),
      isFraction('joinable_funds_target', 'body', true),
    ]),
    function (_request: Request, response: Response): void {
      response.status(404).send('Not implemented yet');
    },
  );

  router.delete('/:tokenAddress', validate([isAddress('tokenAddress', 'params')]), function (
    _request: Request,
    response: Response,
  ): void {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
