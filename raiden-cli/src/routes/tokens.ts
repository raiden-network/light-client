import { Router, Request, Response } from 'express';
import { first } from 'rxjs/operators';

import { Cli } from '../types';
import { validateAddressParameter } from '../utils/validation';

async function getAllTokens(this: Cli, _request: Request, response: Response) {
  response.json(await this.raiden.getTokenList());
}

async function getTokenNetwork(this: Cli, request: Request, response: Response) {
  // Attention: this also enables monitoring token
  try {
    response.json(await this.raiden.monitorToken(request.params.tokenAddress));
  } catch (error) {
    response.status(404).send(error.message);
  }
}

async function getTokenPartners(this: Cli, request: Request, response: Response) {
  const token: string = request.params.tokenAddress;
  const channelsDict = await this.raiden.channels$.pipe(first()).toPromise();
  const baseUrl = request.baseUrl.replace(/\/\w+$/, '');
  response.json(
    Object.values(channelsDict[token] ?? {}).map((channel) => ({
      partner_address: channel.partner,
      channel: `${baseUrl}/channels/${token}/${channel.partner}`,
    })),
  );
}

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
