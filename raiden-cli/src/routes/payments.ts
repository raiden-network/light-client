import { Router, Request, Response } from 'express';

const router = Router();

router.get('/:tokenAddress/:targetAddress', function (request: Request, response: Response): void {
  response.send(
    `Get payment for token ${request.params.tokenAddress} to ${request.params.targetAddress}`,
  );
});

router.post('/:tokenAddress/:targetAddress', function (
  request: Request,
  response: Response,
): void {
  response.send(
    `Send payment for token ${request.params.tokenAddress} to ${request.params.targetAddress}`,
  );
});

export default router;
