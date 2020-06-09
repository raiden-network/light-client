import { Router, Request, Response } from 'express';
import { first } from 'rxjs/operators';
import { Cli } from '../types';
import { validateAddressParameter } from '../utils/validation';
import {
  flattenChannelDictionary,
  transformSdkChannelFormatToApi,
  filterChannels,
} from '../utils/channels';

export function makeChannelsRouter(this: Cli): Router {
  const router = Router();

  router.get('/', async (_request: Request, response: Response) => {
    const channelDictionary = await this.raiden.channels$.pipe(first()).toPromise();
    const channelList = flattenChannelDictionary(channelDictionary);
    const formattedChannels = transformSdkChannelFormatToApi(channelList);
    response.json(formattedChannels);
  });

  router.get(
    '/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    async (request: Request, response: Response) => {
      const channelDictionary = await this.raiden.channels$.pipe(first()).toPromise();
      const channelList = flattenChannelDictionary(channelDictionary);
      const filteredChannels = filterChannels(channelList, request.params.tokenAddress);
      const formattedChannels = transformSdkChannelFormatToApi(filteredChannels);
      response.json(formattedChannels);
    },
  );

  router.get(
    '/:tokenAddress/:partnerAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('partnerAddress'),
    async (request: Request, response: Response) => {
      const channelDictionary = await this.raiden.channels$.pipe(first()).toPromise();
      const channelList = flattenChannelDictionary(channelDictionary);
      const filteredChannels = filterChannels(
        channelList,
        request.params.tokenAddress,
        request.params.partnerAddress,
      );
      const formattedChannels = transformSdkChannelFormatToApi(filteredChannels);

      if (formattedChannels.length) {
        response.json(formattedChannels[0]);
      } else {
        response.status(404).send('The channel does not exist');
      }
    },
  );

  router.put('/', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  router.patch('/:tokenAddress/:partnerAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
