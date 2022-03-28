import { utils } from 'ethers';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import type { Cli } from '../types';
import { isInvalidParameterError, validateAddressParameter } from '../utils/validation';
import { closeAndSettleAll } from './connections';

const { formatUnits } = utils;

async function mintTokens(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const transactionHash = await this.raiden.mint(
      request.params.tokenAddress,
      request.body.value,
      { to: request.body.to },
    );
    response.json({ transaction_hash: transactionHash });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

async function getOnchainTokenBalance(
  this: Cli,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const [balance, info] = await Promise.all([
      this.raiden.getTokenBalance(request.params.tokenAddress, request.body.address),
      this.raiden.getTokenInfo(request.params.tokenAddress),
    ]);
    response.json({
      balance: balance.toString(),
      balance_txt: formatUnits(balance, info.decimals),
    });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

async function transferOnchainTokens(
  this: Cli,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const transactionHash = await this.raiden.transferOnchainTokens(
      request.params.tokenAddress,
      request.body.to,
      request.body.value,
    );
    response.json({ transaction_hash: transactionHash });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

async function getOnchainBalance(
  this: Cli,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const balance = await this.raiden.getBalance(request.body.address);
    response.json({ balance: balance.toString(), balance_txt: formatUnits(balance, 'ether') });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

async function transferOnchainBalance(
  this: Cli,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const transactionHash = await this.raiden.transferOnchainBalance(
      request.body.to,
      request.body.value,
    );
    response.json({ transaction_hash: transactionHash });
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

async function exitNetwork(this: Cli, request: Request, response: Response, next: NextFunction) {
  try {
    const result: {
      closeTxs: string[];
      settleTxs: string[];
      tokensTransferTxs: string[];
      udcWithdrawPlanTx?: string;
      udcWithdrawTx?: string;
      etherTransferTx?: string;
    } = {
      closeTxs: [],
      settleTxs: [],
      tokensTransferTxs: [],
    };

    const closeAndSettleAllChannelsPromise = closeAndSettleAll.call(this.raiden);
    const withdrawUdcPromise = (async () => {
      try {
        result.udcWithdrawPlanTx = await this.raiden.planUDCWithdraw();
        result.udcWithdrawTx = await this.raiden.withdrawFromUDC();
      } catch (e) {} // maybe no UDC deposit (remaining)
    })();

    // wait both tasks
    const [closeAndSettleTxs] = await Promise.all([
      closeAndSettleAllChannelsPromise,
      withdrawUdcPromise,
    ]);
    result.closeTxs = closeAndSettleTxs.closeTxs;
    result.settleTxs = closeAndSettleTxs.settleTxs;

    const tokens = new Set(await this.raiden.getTokenList());
    tokens.add(await this.raiden.userDepositTokenAddress());

    // if a beneficiary was provided in body
    if (request.body.beneficiary) {
      // withdraw all tokens in parallel
      await Promise.all(
        [...tokens].map(async (token) => {
          if ((await this.raiden.getTokenBalance(token)).isZero()) return;
          result.tokensTransferTxs.push(
            await this.raiden.transferOnchainTokens(token, request.body.beneficiary),
          );
        }),
      );

      // transfer all ether
      if ((await this.raiden.getBalance()).gt(0)) {
        result.etherTransferTx = await this.raiden.transferOnchainBalance(
          request.body.beneficiary,
        );
      }
    }

    response.json(result);
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else next(error);
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeTestingRouter(this: Cli): Router {
  const router = Router();

  router.post(
    '/tokens/:tokenAddress/mint',
    validateAddressParameter.bind('tokenAddress'),
    mintTokens.bind(this),
  );

  router.get(
    '/tokens/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    getOnchainTokenBalance.bind(this),
  );

  router.post(
    '/tokens/:tokenAddress/transfer',
    validateAddressParameter.bind('tokenAddress'),
    transferOnchainTokens.bind(this),
  );

  router.get('/balance', getOnchainBalance.bind(this));
  router.post('/balance', transferOnchainBalance.bind(this));

  /** Close/settle all channels, withdraw from UDC and optionally transfer tokens and ETH */
  router.post('/exit', exitNetwork.bind(this));

  return router;
}
