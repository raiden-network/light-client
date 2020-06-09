import { Router, Request, Response } from 'express';
import { Cli } from '../types';

export function makeTokensRouter(this: Cli): Router {
  const router = Router();

  router.get('/', function (_request: Request, response: Response): void {
    response.status(404).send('Not implemented yet');
  });

  router.get('/:tokenAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  router.get('/:tokenAddress/partners', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  router.put('/:tokenAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
