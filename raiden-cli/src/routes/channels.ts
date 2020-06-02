import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', function (_request: Request, response: Response): void {
  response.send('All channel');
});

router.get('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Requested channels for token ${request.params.tokenAddress}`);
});

router.get('/:tokenAddress/:partnerAddress', function (
  request: Request,
  response: Response,
): void {
  response.send(
    `Requested channels for token ${request.params.tokenAddress} and partner ${request.params.partnerAddress}`,
  );
});

router.put('/', function (_request: Request, response: Response): void {
  response.send(`Open channel`);
});

router.patch('/:tokenAddress/:partnerAddress', function (
  request: Request,
  response: Response,
): void {
  response.send(
    `Update channel for token ${request.params.tokenAddress} and partner ${request.params.partnerAddress}`,
  );
});

export default router;
