import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { firstValueFrom } from 'rxjs';

import { ChannelState, isntNil } from 'raiden-ts';

import type { Cli } from '../types';
import {
  isConflictError,
  isInsuficientFundsError,
  isInvalidParameterError,
  validateAddressParameter,
} from '../utils/validation';

export interface ApiConnection {
  channels: string;
  sum_deposits: string;
  funds: string;
}

export interface ApiTokenConnections {
  [token: string]: ApiConnection;
}

async function getConnections(this: Cli, _request: Request, response: Response) {
  const channelsDict = await firstValueFrom(this.raiden.channels$);
  const connections = Object.entries(channelsDict).reduce<ApiTokenConnections>(
    (connections, [token, partnerChannel]) => ({
      ...connections,
      [token]: Object.values(partnerChannel).reduce<ApiConnection>(
        ({ channels, funds }, { ownDeposit, ownWithdraw }) => {
          const deposits = ownDeposit.sub(ownWithdraw).add(funds).toString();
          return {
            channels: (+channels + 1).toString(),
            sum_deposits: deposits,
            funds: deposits,
          };
        },
        { channels: '0', sum_deposits: '0', funds: '0' },
      ),
    }),
    {},
  );
  response.json(connections);
}

/**
 * Naive connection manager: only supports connecting to a single hardcoded hub
 * We don't want to improve this (for now), since SDK doesn't have the concept of connection
 * manager; it may change when we have proper auto-pilot (#211); before that, this dummy
 * implementation should enough to make WebUI work with it
 *
 * @param this - Cli object
 * @param request - Request param
 * @param response - Response param
 * @param next - Next callback
 * @returns Response
 */
async function connectTokenNetwork(
  this: Cli,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (request.body.initial_channel_target && request.body.initial_channel_target != 1)
    return response.status(409).send('CLI only supports managing connection with one hub');
  if (request.body.joinable_funds_target && request.body.joinable_funds_target != 1)
    return response.status(409).send('CLI only supports allocating whole funds');
  const token: string = request.params.tokenAddress;
  try {
    const channelsDict = await firstValueFrom(this.raiden.channels$);
    const hub = await this.raiden.resolveName('hub.raiden.eth');
    const channel = channelsDict[token]?.[hub];
    if (!channel) {
      await this.raiden.openChannel(token, hub, {
        deposit: request.body.funds,
      });
    } else if (
      request.body.funds &&
      channel.ownDeposit.sub(channel.ownWithdraw).lt(request.body.funds)
    ) {
      // if channel exists but allocated funds are lower than requested, deposit difference
      // amount = funds - (ownDeposit - ownWithdraw) = ((ownDeposit - ownWithdraw) - funds) * -1
      const amount = channel.ownDeposit.sub(channel.ownWithdraw).sub(request.body.funds).mul(-1);
      await this.raiden.depositChannel(token, hub, amount);
    }
    response.status(204);
  } catch (error) {
    if (isInvalidParameterError(error)) response.status(400).send(error.message);
    else if (isInsuficientFundsError(error)) response.status(402).send(error.message);
    else if (isConflictError(error)) response.status(409).send(error.message);
    else next(error);
  }
}

/**
 * Closes all closeable channels in a token network
 * TODO: implement auto-settle (see discussion at #237)
 *
 * @param this - Cli object
 * @param request - Request param
 * @param response - Response param
 * @returns Response
 */
async function disconnectTokenNetwork(this: Cli, request: Request, response: Response) {
  const token: string = request.params.tokenAddress;
  const channelsDict = await firstValueFrom(this.raiden.channels$);
  if (!channelsDict[token]) return response.status(404).send('No channels on tokenNetwork');
  const closeableChannels = Object.values(channelsDict[token]).filter((channel) =>
    [ChannelState.open, ChannelState.closing].includes(channel.state),
  );
  const promises: Promise<string | undefined>[] = [];
  for (let i = 0; i < closeableChannels.length; i++) {
    // if more than one channel to close, wait 1s between each call to avoid nonce races
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    const channel = closeableChannels[i];
    promises.push(
      this.raiden.closeChannel(token, channel.partner).then(
        () => channel.partner,
        () => undefined,
      ),
    );
  }
  const partners: string[] = (await Promise.all(promises)).filter(isntNil);
  response.json(partners);
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeConnectionsRouter(this: Cli): Router {
  const router = Router();

  router.get('/', getConnections.bind(this));

  router.put(
    '/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    connectTokenNetwork.bind(this),
  );

  router.delete(
    '/:tokenAddress',
    validateAddressParameter.bind('tokenAddress'),
    disconnectTokenNetwork.bind(this),
  );

  return router;
}
