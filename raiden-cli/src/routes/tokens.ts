import type { Request, Response } from 'express';
import { Router } from 'express';
import { first } from 'rxjs/operators';

import type { Cli } from '../types';
import { validateAddressParameter } from '../utils/validation';

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
    response.status(404).send(error.message);
  }
}

async function getTokenPartners(this: Cli, request: Request, response: Response) {
  const token: string = request.params.tokenAddress;
  const channelsDict = await this.raiden.channels$.pipe(first()).toPromise();
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

  router.put('/:tokenAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
