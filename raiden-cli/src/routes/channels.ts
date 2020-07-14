import { Router, Request, Response, NextFunction } from 'express';
import { first, pluck } from 'rxjs/operators';
import { ErrorCodes, RaidenError, isntNil } from 'raiden-ts';
import { Cli } from '../types';
import {
  isInvalidParameterError,
  isTransactionWouldFailError,
  validateOptionalAddressParameter,
} from '../utils/validation';
import { flattenChannelDictionary, transformSdkChannelFormatToApi } from '../utils/channels';

function isConflictError(error: RaidenError): boolean {
  return (
    [ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, ErrorCodes.CNL_INVALID_STATE].includes(error.message) ||
    isTransactionWouldFailError(error)
  );
}

async function getChannels(this: Cli, request: Request, response: Response) {
  const channelsDict = await this.raiden.channels$.pipe(first()).toPromise();
  const token: string | undefined = request.params.tokenAddress;
  const partner: string | undefined = request.params.partnerAddress;
  if (token && partner) {
    const channel = channelsDict[token]?.[partner];
    if (channel) {
      response.json(transformSdkChannelFormatToApi(channel));
    } else {
      response.status(404).send('The channel does not exist');
    }
  } else {
    let channelsList = flattenChannelDictionary(channelsDict);
    if (token) channelsList = channelsList.filter((channel) => channel.token === token);
    if (partner) channelsList = channelsList.filter((channel) => channel.token === partner);
    response.json(channelsList.map(transformSdkChannelFormatToApi));
  }
}

async function openChannel(this: Cli, request: Request, response: Response, next: NextFunction) {
  const token: string = request.body.token_address;
  const partner: string = request.body.partner_address;
  try {
    // TODO: We ignore the provided `reveal_timeout` until #1656 provides
    // a better solution.
    await this.raiden.openChannel(token, partner, {
      settleTimeout: request.body.settle_timeout,
      deposit: request.body.total_deposit,
    });
    const channel = await this.raiden.channels$
      .pipe(pluck(token, partner), first(isntNil))
      .toPromise();
    response.status(201).json(transformSdkChannelFormatToApi(channel));
  } catch (error) {
    if (isInvalidParameterError(error)) {
      response.status(400).send(error.message);
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      response.status(402).send(error.message);
    } else if (isConflictError(error)) {
      response.status(409).send(error.message);
    } else {
      next(error);
    }
  }
}

export function makeChannelsRouter(this: Cli): Router {
  const router = Router();

  router.get(
    '/:tokenAddress?/:partnerAddress?',
    validateOptionalAddressParameter.bind('tokenAddress'),
    validateOptionalAddressParameter.bind('partnerAddress'),
    getChannels.bind(this),
  );

  router.put('/', openChannel.bind(this));

  router.patch('/:tokenAddress/:partnerAddress', (_request: Request, response: Response) => {
    response.status(404).send('Not implemented yet');
  });

  return router;
}
