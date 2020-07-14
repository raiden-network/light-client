import { Router, Request, Response, NextFunction } from 'express';
import { first, pluck } from 'rxjs/operators';
import { ErrorCodes, isntNil, ChannelState } from 'raiden-ts';
import { Cli, ApiChannelState } from '../types';
import {
  isInvalidParameterError,
  isTransactionWouldFailError,
  validateOptionalAddressParameter,
} from '../utils/validation';
import { flattenChannelDictionary, transformSdkChannelFormatToApi } from '../utils/channels';

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
      ErrorCodes.DTA_INVALID_AMOUNT,
      ErrorCodes.DTA_INVALID_DEPOSIT,
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
    } else if (isInvalidParameterError(error)) {
      response.status(402).send(error.message);
    } else if (isConflictError(error)) {
      response.status(409).send(error.message);
    } else {
      next(error);
    }
  }
}

const allowedUpdateKeys = new Set(['state', 'total_deposit', 'total_withdraw']);
function validateChannelUpdateBody(request: Request, response: Response, next: NextFunction) {
  const intersec = Object.keys(request.body).filter((k) => allowedUpdateKeys.has(k));
  if (intersec.length < 1)
    return response
      .status(400)
      .send('one of "state" | "total_deposit" | "total_withdraw" operations required');
  else if (intersec.length > 1)
    return response
      .status(409)
      .send('more than one of "state" | "total_deposit" | "total_withdraw" requested');
  if (
    request.body.state &&
    ![ApiChannelState.closed, ApiChannelState.settled].includes(request.body.state)
  )
    return response
      .status(400)
      .send('invalid "state" requested: must be one of "closed" | "settled"');
  return next();
}

async function updateChannel(this: Cli, request: Request, response: Response, next: NextFunction) {
  const token: string = request.params.tokenAddress;
  const partner: string = request.params.partnerAddress;
  try {
    let channel = await this.raiden.channels$.pipe(first(), pluck(token, partner)).toPromise();
    if (!channel) return response.status(404).send('channel not found');
    if (request.body.state) {
      if (request.body.state === ApiChannelState.closed) {
        await this.raiden.closeChannel(token, partner);
        channel = await this.raiden.channels$
          .pipe(
            pluck(token, partner),
            first((channel) =>
              [ChannelState.closed, ChannelState.settleable, ChannelState.settling].includes(
                channel.state,
              ),
            ),
          )
          .toPromise();
      } else if (request.body.state === ApiChannelState.settled) {
        const promise = this.raiden.settleChannel(token, partner);
        channel = await this.raiden.channels$.pipe(pluck(token, partner), first()).toPromise();
        await promise;
      }
    } else if (request.body.total_deposit) {
      await this.raiden.depositChannel(
        token,
        partner,
        channel.ownDeposit.sub(request.body.total_deposit).mul(-1),
      );
      channel = await this.raiden.channels$
        .pipe(
          pluck(token, partner),
          first((channel) => channel.ownDeposit.gte(request.body.total_deposit)),
        )
        .toPromise();
    } else if (request.body.total_withdraw) {
      await this.raiden.withdrawChannel(
        token,
        partner,
        channel.ownWithdraw.sub(request.body.total_withdraw).mul(-1),
      );
      channel = await this.raiden.channels$
        .pipe(
          pluck(token, partner),
          first((channel) => channel.ownWithdraw.gte(request.body.total_withdraw)),
        )
        .toPromise();
    }
    response.status(200).json(transformSdkChannelFormatToApi(channel));
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
    validateOptionalAddressParameter.bind('tokenAddress'),
    validateOptionalAddressParameter.bind('partnerAddress'),
    validateChannelUpdateBody,
    updateChannel.bind(this),
  );

  return router;
}
