import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', function (_request: Request, response: Response): void {
  response.send('All pending transfers');
});

router.get('/:tokenAddress', function (request: Request, response: Response): void {
  response.send(`Get pending transfers for token ${request.params.tokenAddress}`);
});

router.get('/:tokenAddress/:partnerAddress', function (
  request: Request,
  response: Response,
): void {
  response.send(
    `Get pending transfers for token ${request.params.tokenAddress} and partner ${request.params.partnerAddress}`,
  );
});

export default router;
