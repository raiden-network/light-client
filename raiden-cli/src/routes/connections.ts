import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', function (_request: Request, response: Response): void {
  response.send('All connections');
});

router.put('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Add connections for token ${request.params.tokenAddress}`);
});

router.delete('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Remove connections for token ${request.params.tokenAddress}`);
});

export default router;
