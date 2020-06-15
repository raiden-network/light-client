import { Router, Request, Response, NextFunction } from 'express';
import { first } from 'rxjs/operators';
import { ErrorCodes, RaidenError } from 'raiden-ts';
import { Cli } from '../types';
import {
  validateAddressParameter,
  isInvalidParameterError,
  isTransactionWouldFailError,
} from '../utils/validation';
import {
  flattenChannelDictionary,
  transformSdkChannelFormatToApi,
  filterChannels,
} from '../utils/channels';

function isConflictError(error: RaidenError): boolean {
  return (
    [ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, ErrorCodes.CNL_INVALID_STATE].includes(error.message) ||
    isTransactionWouldFailError(error)
  );
}

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

  router.put('/', async (request: Request, response: Response, next: NextFunction) => {
    try {
      // TODO: We ignore the provided `reveal_timeout` until #1656 provides
      // a better solution.
      await this.raiden.openChannel(request.body.token_address, request.body.partner_address, {
        settleTimeout: request.body.settle_timeout,
        deposit: request.body.total_deposit,
      });
      const channelDictionary = await this.raiden.channels$.pipe(first()).toPromise();
      const newChannel =
        channelDictionary[request.body.token_address][request.body.partner_address];
      response.status(201).json(newChannel);
    } catch (error) {
      console.log(error.code);
      if (isInvalidParameterError(error)) {
        response.status(400).send(error.message);
      } else if (isConflictError(error)) {
        response.status(409).send(error.message);
      } else {
        next(error);
      }

      // FIXME: Based on #1698 there must be a case with status code 402
    }
  });

  router.patch('/:tokenAddress/:partnerAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
