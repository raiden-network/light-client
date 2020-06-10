import { Router, Request, Response } from 'express';
import { Cli } from '../types';

export function makePaymentsRouter(this: Cli): Router {
  const router = Router();

  router.get('/:tokenAddress/:targetAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  router.post('/:tokenAddress/:targetAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
