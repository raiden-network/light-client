import { BigNumber, constants } from 'ethers';
import type { Request, Response } from 'express';
import { Router } from 'express';

import type { Cli } from '../types';
import {
  isConflictError,
  isInsuficientFundsError,
  isInvalidParameterError,
} from '../utils/validation';

type DepositResponse = { transaction_hash: string };
type PlanWithdrawResponse = { transaction_hash: string; planned_withdraw_block_number: number };
type WithdrawResponse = { transaction_hash: string };

const MalformedNumberValue = new Error('A provided number value was not decodable');
const MalformedRequestFormat = new Error('The provided JSON is in some way malformed');
const TotalDepositTooLowError = new Error(
  'The provided total_deposit is not higher than the previous total_deposit',
);

function parseAsBigNumber(input: unknown): BigNumber {
  try {
    return BigNumber.from(input);
  } catch {
    throw MalformedNumberValue;
  }
}

function getTotalDepositAmount(request: Request): string | undefined {
  return request.body.total_deposit?.toString();
}

function getPlannedWithdrawAmount(request: Request): string | undefined {
  return request.body.planned_withdraw_amount?.toString();
}

function getWithdrawAmount(request: Request): string | undefined {
  return request.body.withdraw_amount?.toString();
}

function shouldDeposit(request: Request): boolean {
  return (
    getTotalDepositAmount(request) !== undefined &&
    getPlannedWithdrawAmount(request) === undefined &&
    getWithdrawAmount(request) === undefined
  );
}

function shouldPlanWithdraw(request: Request): boolean {
  return (
    getTotalDepositAmount(request) === undefined &&
    getPlannedWithdrawAmount(request) !== undefined &&
    getWithdrawAmount(request) === undefined
  );
}

function shouldWithdraw(request: Request): boolean {
  return (
    getTotalDepositAmount(request) === undefined &&
    getPlannedWithdrawAmount(request) === undefined &&
    getWithdrawAmount(request) !== undefined
  );
}

async function deposit(this: Cli, totalDeposit: string): Promise<DepositResponse> {
  const totalDepositTarget = parseAsBigNumber(totalDeposit);
  const currentTotalDeposit = await this.raiden.getUDCTotalDeposit();
  const depositDifference = totalDepositTarget.sub(currentTotalDeposit);

  if (depositDifference.lte(constants.Zero)) throw TotalDepositTooLowError;

  const transactionHash = await this.raiden.depositToUDC(depositDifference);
  return { transaction_hash: transactionHash };
}

async function planWithdraw(this: Cli, amount: string): Promise<PlanWithdrawResponse> {
  const transactionHash = await this.raiden.planUDCWithdraw(amount);
  const withdrawPlan = await this.raiden.getUDCWithdrawPlan();
  return {
    transaction_hash: transactionHash,
    planned_withdraw_block_number: withdrawPlan!.block, // The plan must exists here.
  };
}

async function withdraw(this: Cli, amount: string): Promise<WithdrawResponse> {
  const transactionHash = await this.raiden.withdrawFromUDC(amount);
  return { transaction_hash: transactionHash };
}

async function determineAndExecuteRequestedInteraction(
  this: Cli,
  request: Request,
): Promise<DepositResponse | PlanWithdrawResponse | WithdrawResponse> {
  if (shouldDeposit(request)) {
    const totalDeposit = getTotalDepositAmount(request)!; // Can't be undefined here.
    return await deposit.call(this, totalDeposit);
  } else if (shouldPlanWithdraw(request)) {
    const amount = getPlannedWithdrawAmount(request)!; // Can't be undefined here.
    return await planWithdraw.call(this, amount);
  } else if (shouldWithdraw(request)) {
    const amount = getWithdrawAmount(request)!; // Can't be undefined here.
    return await withdraw.call(this, amount);
  } else {
    throw MalformedRequestFormat;
  }
}

async function getUDCInfo(this: Cli, _request: Request, response: Response): Promise<void> {
  const balance = await this.raiden.getUDCCapacity();
  const totalDeposit = await this.raiden.getUDCTotalDeposit();

  response.json({
    balance: balance.toString(),
    total_deposit: totalDeposit.toString(),
  });
}

async function getUDCWithdrawPlan(
  this: Cli,
  _request: Request,
  response: Response,
): Promise<void> {
  const withdrawPlan = await this.raiden.getUDCWithdrawPlan();

  if (withdrawPlan !== undefined) {
    response.json({ ...withdrawPlan, amount: withdrawPlan.amount.toString() });
  } else {
    response.send();
  }
}

async function interactWithUDC(this: Cli, request: Request, response: Response): Promise<void> {
  try {
    const interactionResponse = await determineAndExecuteRequestedInteraction.call(this, request);
    response.json(interactionResponse);
  } catch (error) {
    if (
      isInvalidParameterError(error) ||
      error === MalformedNumberValue ||
      error === MalformedRequestFormat
    ) {
      response.status(400).send(error.message);
    } else if (isInsuficientFundsError(error)) {
      response.status(402).send(error.message);
    } else if (isConflictError(error) || error === TotalDepositTooLowError) {
      response.status(409).send(error.message);
    } else {
      response.status(500).send(error.message);
    }
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeUserDepositRouter(this: Cli): Router {
  const router = Router();

  router.get('/', getUDCInfo.bind(this));
  router.post('/', interactWithUDC.bind(this));
  router.get('/withdraw_plan', getUDCWithdrawPlan.bind(this));

  return router;
}
