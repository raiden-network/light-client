import { Router, Request, Response } from 'express';
import { Cli } from '../types';

export function makeTestingRouter(this: Cli): Router {
  const router = Router();

  router.get('/tokens/:tokenAddress/mint', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
