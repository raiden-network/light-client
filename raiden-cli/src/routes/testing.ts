import { Router, Request, Response } from 'express';

const router = Router();

router.get('/tokens/:tokenAddress/mint', function (request: Request, response: Response): void {
  response.send(`Test - mint tokens for ${request.params.tokenAddress}`);
});

export default router;
