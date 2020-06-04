import { Router, Request, Response } from 'express';
import { validate, isAddress, isAmount } from '../utils/validation';

const router = Router();

router.get(
  '/tokens/:tokenAddress/mint',
  validate([
    isAddress('tokenAddress', 'params'),
    isAddress('to', 'body'),
    isAmount('value', 'body'),
  ]),
  function (_request: Request, response: Response): void {
    response.status(404).send('Not implemented yet');
  },
);

export default router;
