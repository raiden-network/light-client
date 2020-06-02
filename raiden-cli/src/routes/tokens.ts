import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', function (_request: Request, response: Response): void {
  response.send('All tokens');
});

router.get('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Get token ${request.params.tokenAddress}`);
});

router.get('/:tokenAddress/partners', function (request: Request, response: Response): void {
  response.send(`Get token partners for ${request.params.tokenAddress}`);
});

router.put('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Add token ${request.params.tokenAddress}`);
});

export default router;
