import { Router, Request, Response, NextFunction } from 'express';
import { first, pluck } from 'rxjs/operators';
import { ErrorCodes, isntNil, ChannelState, RaidenChannel } from 'raiden-ts';
import { Cli, ApiChannelState } from '../types';
import {
  isInvalidParameterError,
  isTransactionWouldFailError,
  validateOptionalAddressParameter,
  validateAddressParameter,
} from '../utils/validation';
import { flattenChannelDictionary, transformChannelFormatForApi } from '../utils/channels';

function isConflictError(error: Error): boolean {
  return (
    [ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, ErrorCodes.CNL_INVALID_STATE].includes(error.message) ||
    isTransactionWouldFailError(error)
  );
}

function isInsuficientFundsError(error: { message: string; code?: string | number }): boolean {
  return (
    error.code === 'INSUFFICIENT_FUNDS' ||
    [
      ErrorCodes.RDN_INSUFFICIENT_BALANCE,
      ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_LOW,
      ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_HIGH,
    ].includes(error.message)
  );
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
      deposit: request.body.total_deposit,
    });
    const channel = await this.raiden.channels$
      .pipe(pluck(token, partner), first(isntNil))
      .toPromise();
    response.status(201).json(transformChannelFormatForApi(channel));
  } catch (error) {
    if (isInvalidParameterError(error)) {
      response.status(400).send(error.message);
    } else if (isInvalidParameterError(error)) {
      response.status(402).send(error.message);
    } else if (isConflictError(error)) {
      response.status(409).send(error.message);
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
    if (!channel) return response.status(404).send('channel not found');
    if (request.body.state) {
      channel = await updateChannelState.call(this, channel, request.body.state);
    } else if (request.body.total_deposit) {
      channel = await updateChannelDeposit.call(this, channel, request.body.total_deposit);
    } else if (request.body.total_withdraw) {
      channel = await updateChannelWithdraw.call(this, channel, request.body.total_withdraw);
    }
    response.status(200).json(transformChannelFormatForApi(channel));
  } catch (error) {
    if (isInvalidParameterError(error)) {
      response.status(400).send(error.message);
    } else if (isInsuficientFundsError(error)) {
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

  router.patch(
    '/:tokenAddress/:partnerAddress',
    validateAddressParameter.bind('tokenAddress'),
    validateAddressParameter.bind('partnerAddress'),
    validateChannelUpdateBody,
    updateChannel.bind(this),
  );

  return router;
}
