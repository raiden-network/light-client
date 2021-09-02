import type { Request, Response } from 'express';
import { Router } from 'express';
import { firstValueFrom } from 'rxjs';

import type { Cli } from '../types';
import {
  isConflictError,
  isInsuficientFundsError,
  isInvalidParameterError,
  validateAddressParameter,
} from '../utils/validation';

export interface ApiTokenPartner {
  partner_address: string;
  channel: string;
}

async function getAllTokens(this: Cli, _request: Request, response: Response) {
  const tokensList = await this.raiden.getTokenList();
  response.json(tokensList);
}

async function getTokenNetwork(this: Cli, request: Request, response: Response) {
  // Attention: this also enables monitoring token
  try {
    const tokenNetwork = await this.raiden.monitorToken(request.params.tokenAddress);
    response.json(tokenNetwork);
  } catch (error) {
    response.status(404).send((error as Error).message);
  }
}

async function getTokenPartners(this: Cli, request: Request, response: Response) {
  const token: string = request.params.tokenAddress;
  const channelsDict = await firstValueFrom(this.raiden.channels$);
  const baseUrl = request.baseUrl.replace(/\/\w+$/, '');
  response.json(
    Object.values(channelsDict[token] ?? {}).map(
      (channel): ApiTokenPartner => ({
        partner_address: channel.partner,
        channel: `${baseUrl}/channels/${token}/${channel.partner}`,
      }),
    ),
  );
}

async function registerToken(this: Cli, request: Request, response: Response) {
  const token: string = request.params.tokenAddress;
  try {
    const address = await this.raiden.registerToken(token);
    response.status(201).json({ token_network_address: address });
  } catch (error) {
    if (isInsuficientFundsError(error)) {
      response.status(402).send(error.message);
    } else if (isInvalidParameterError(error) || isConflictError(error)) {
      response.status(409).send({ message: error.message });
    } else {
      response.status(500).send((error as Error).message);
    }
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeTokensRouter(this: Cli): Router {
  const router = Router();

  router.get('/', getAllTokens.bind(this));

  router.get(
    '/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    getTokenNetwork.bind(this),
  );

  router.get(
    '/:tokenAddress/partners',
    validateAddressParameter.bind('tokenAddress'),
    getTokenPartners.bind(this),
  );

  router.put(
    '/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    registerToken.bind(this),
  );

  return router;
}
