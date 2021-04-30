import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { first, pluck } from 'rxjs/operators';

import type { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { ChannelState, ErrorCodes, isntNil, RaidenError } from 'raiden-ts';

import type { Cli } from '../types';
import {
  isConflictError,
  isInsuficientFundsError,
  isInvalidParameterError,
  validateAddressParameter,
  validateOptionalAddressParameter,
} from '../utils/validation';

export enum ApiChannelState {
  opened = 'opened',
  closed = 'closed',
  settled = 'settled',
}

// Data structures as exchanged over the API
export interface ApiChannel {
  channel_identifier: string;
  token_network_address: string;
  partner_address: string;
  token_address: string;
  balance: string;
  total_deposit: string;
  total_withdraw: string;
  state: ApiChannelState;
  settle_timeout: string;
  reveal_timeout: string;
}

function flattenChannelDictionary(channelDict: RaidenChannels): RaidenChannel[] {
  // To flatten structure {token: {partner: [channel..], partner:...}, token...}
  return Object.values(channelDict).reduce(
    (allChannels, tokenPartners) => allChannels.concat(Object.values(tokenPartners)),
    [] as RaidenChannel[],
  );
}

function transformChannelStateForApi(state: ChannelState): ApiChannelState {
  let apiState;
  switch (state) {
    case ChannelState.open:
    case ChannelState.closing:
      apiState = ApiChannelState.opened;
      break;
    case ChannelState.closed:
    case ChannelState.settleable:
    case ChannelState.settling:
      apiState = ApiChannelState.closed;
      break;
    case ChannelState.settled:
      apiState = ApiChannelState.settled;
      break;
  }
  return apiState;
}

function transformChannelFormatForApi(channel: RaidenChannel): ApiChannel {
  return {
    channel_identifier: channel.id.toString(),
    token_network_address: channel.tokenNetwork,
    partner_address: channel.partner,
    token_address: channel.token,
    balance: channel.capacity.toString(),
    total_deposit: channel.ownDeposit.toString(),
    total_withdraw: channel.ownWithdraw.toString(),
    state: transformChannelStateForApi(channel.state),
    settle_timeout: channel.settleTimeout.toString(),
    reveal_timeout: '50', // FIXME: Not defined here. Python client handles reveal timeout differently,
  };
}

async function getChannels(this: Cli, request: Request, response: Response) {
  const channelsDict = await this.raiden.channels$.pipe(first()).toPromise();
  const token: string | undefined = request.params.tokenAddress;
  const partner: string | undefined = request.params.partnerAddress;
  if (token && partner) {
    const channel = channelsDict[token]?.[partner];
    if (channel) {
      response.json(transformChannelFormatForApi(channel));
    } else {
      response.status(404).send('The channel does not exist');
    }
  } else {
    let channelsList = flattenChannelDictionary(channelsDict);
    if (token) channelsList = channelsList.filter((channel) => channel.token === token);
    if (partner) channelsList = channelsList.filter((channel) => channel.token === partner);
    response.json(channelsList.map(transformChannelFormatForApi));
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
      deposit: request.body.total_deposit?.toString(),
    });
    const channel = await this.raiden.channels$
      .pipe(pluck(token, partner), first(isntNil))
      .toPromise();
    response.status(201).json(transformChannelFormatForApi(channel));
  } catch (error) {
    if (isInsuficientFundsError(error)) {
      response.status(402).send(error.message);
    } else if (isInvalidParameterError(error) || isConflictError(error)) {
      response.status(409).send({ message: error.message });
    } else {
      next(error);
    }
  }
}

const allowedUpdateKeys = ['state', 'total_deposit', 'total_withdraw'];
const allowedUpdateStates = [ApiChannelState.closed, ApiChannelState.settled];
function validateChannelUpdateBody(request: Request, response: Response, next: NextFunction) {
  const intersec = Object.keys(request.body).filter((k) => allowedUpdateKeys.includes(k));
  if (intersec.length < 1)
    return response.status(400).send(`one of [${allowedUpdateKeys}] operations required`);
  else if (intersec.length > 1)
    return response.status(409).send(`more than one of [${allowedUpdateKeys}] requested`);
  if (request.body.state && !allowedUpdateStates.includes(request.body.state))
    return response
      .status(400)
      .send(`invalid "state" requested: must be one of [${allowedUpdateStates}]`);
  return next();
}

async function updateChannelState(
  this: Cli,
  channel: RaidenChannel,
  newState: ApiChannelState.closed | ApiChannelState.settled,
): Promise<RaidenChannel> {
  if (newState === ApiChannelState.closed) {
    await this.raiden.closeChannel(channel.token, channel.partner);
    const closedStates = [ChannelState.closed, ChannelState.settleable, ChannelState.settling];
    channel = await this.raiden.channels$
      .pipe(
        pluck(channel.token, channel.partner),
        first((channel) => closedStates.includes(channel.state)),
      )
      .toPromise();
  } else if (newState === ApiChannelState.settled) {
    const promise = this.raiden.settleChannel(channel.token, channel.partner);
    const newChannel = await this.raiden.channels$
      .pipe(pluck(channel.token, channel.partner), first())
      .toPromise();
    await promise;
    if (newChannel) channel = newChannel; // channel may have been cleared
  }
  return channel;
}

async function updateChannelDeposit(
  this: Cli,
  channel: RaidenChannel,
  totalDeposit: string,
): Promise<RaidenChannel> {
  // amount = new deposit - previous deposit == (previous deposit - new deposit) * -1
  const depositAmount = channel.ownDeposit.sub(totalDeposit).mul(-1);
  await this.raiden.depositChannel(channel.token, channel.partner, depositAmount);
  return await this.raiden.channels$
    .pipe(
      pluck(channel.token, channel.partner),
      first((channel) => channel.ownDeposit.gte(totalDeposit)),
    )
    .toPromise();
}

async function updateChannelWithdraw(
  this: Cli,
  channel: RaidenChannel,
  totalWithdraw: string,
): Promise<RaidenChannel> {
  // amount = new withdraw - previous withdraw == (previous withdraw - new withdraw) * -1
  const withdrawAmount = channel.ownWithdraw.sub(totalWithdraw).mul(-1);
  await this.raiden.withdrawChannel(channel.token, channel.partner, withdrawAmount);
  return await this.raiden.channels$
    .pipe(
      pluck(channel.token, channel.partner),
      first((channel) => channel.ownWithdraw.gte(totalWithdraw)),
    )
    .toPromise();
}

async function updateChannel(this: Cli, request: Request, response: Response, next: NextFunction) {
  const token: string = request.params.tokenAddress;
  const partner: string = request.params.partnerAddress;
  try {
    let channel = await this.raiden.channels$.pipe(first(), pluck(token, partner)).toPromise();
    if (!channel) throw new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND); // one of conflict errors
    if (request.body.state) {
      channel = await updateChannelState.call(this, channel, request.body.state);
    } else if (request.body.total_deposit) {
      channel = await updateChannelDeposit.call(
        this,
        channel,
        request.body.total_deposit.toString(),
      );
    } else if (request.body.total_withdraw) {
      channel = await updateChannelWithdraw.call(
        this,
        channel,
        request.body.total_withdraw.toString(),
      );
    }
    response.status(200).json(transformChannelFormatForApi(channel));
  } catch (error) {
    if (isInsuficientFundsError(error)) {
      response.status(402).send(error.message);
    } else if (isInvalidParameterError(error) || isConflictError(error)) {
      response.status(409).json({ message: error.message });
    } else {
      next(error);
    }
  }
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makeChannelsRouter(this: Cli): Router {
  const router = Router();

  router.get(
    '/:tokenAddress?/:partnerAddress?',
    validateOptionalAddressParameter.bind('tokenAddress'),
    validateOptionalAddressParameter.bind('partnerAddress'),
    getChannels.bind(this),
  );

  router.put('/', openChannel.bind(this));

  router.patch(
    '/:tokenAddress/:partnerAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('partnerAddress'),
    validateChannelUpdateBody,
    updateChannel.bind(this),
  );

  return router;
}
