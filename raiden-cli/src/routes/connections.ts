import { Router, Request, Response } from 'express';
import { Cli } from '../types';

export function makeConnectionsRouter(this: Cli): Router {
  const router = Router();

  router.get('/', function (_request: Request, response: Response): void {
    response.send('All connections');
  });

  router.put('/:tokenAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  router.delete('/:tokenAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
