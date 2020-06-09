import { Router, Request, Response } from 'express';
import { Cli } from '../types';
import { validate, isAddress } from '../utils/validation';

export function makeTokensRouter(this: Cli): Router {
  const router = Router();

  router.get('/', function (_request: Request, response: Response): void {
    response.status(404).send('Not implemented yet');
  });

  router.get('/:tokenAddress', validate([isAddress('tokenaddress', 'params')]), function (
    _request: Request,
    response: Response,
  ): void {
    response.status(404).send('Not implemented yet');
  });

  router.get('/:tokenAddress/partners', validate([isAddress('tokenAddress', 'params')]), function (
    _request: Request,
    response: Response,
  ): void {
    response.status(404).send('Not implemented yet');
  });

  router.put('/:tokenAddress', validate([isAddress('tokenAddress', 'params')]), function (
    _request: Request,
    response: Response,
  ): void {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
