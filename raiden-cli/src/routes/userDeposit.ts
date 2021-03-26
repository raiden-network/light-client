import type { Request, Response } from 'express';
import { Router } from 'express';

import type { Cli } from '../types';

async function getUDCWithdrawPlan(this: Cli, _request: Request, response: Response) {
  const withdrawPlan = await this.raiden.getUDCWithdrawPlan();

  if (withdrawPlan !== undefined) {
    response.json({ ...withdrawPlan, amount: withdrawPlan.amount.toString() });
  } else {
    response.send();
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeUserDepositRouter(this: Cli): Router {
  const router = Router();

  router.get('/withdraw_plan', getUDCWithdrawPlan.bind(this));

  return router;
}
