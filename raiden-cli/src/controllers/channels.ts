import { Request, Response, NextFunction } from 'express';
import { ChannelState } from 'raiden-ts';
import _ from 'lodash';
import RaidenService from '../raiden';
import { transformChannelFormatSdkToApi } from '../utils/formatting';

export function transformAndSendChannels(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (request.channels !== undefined) {
    response.json(_.map(request.channels, transformChannelFormatSdkToApi));
  } else {
    next();
  }
}

export function attachOpenChannels(request: Request, _response: Response, next: NextFunction) {
  request.channels = RaidenService.getInstance().filterChannels(ChannelState.open);
  next();
}

export function attachOpenChannelsMatchingTokenAddress(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const tokenAddress = request.params.tokenAddress;
  request.channels = RaidenService.getInstance().filterChannels(ChannelState.open, tokenAddress);
  next();
}

export function attachOpenChannelsMatchingTokenAndPartnerAddress(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const tokenAddress = request.params.tokenAddress;
  const partnerAddress = request.params.partnerAddress;
  request.channels = RaidenService.getInstance().filterChannels(
    ChannelState.open,
    tokenAddress,
    partnerAddress,
  );
  next();
}

export async function openChannelAndAttach(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const tokenAddress = request.body.token_address;
  const partnerAddress = request.body.partner_address;
  const totalDeposit = request.body.total_deposit;
  const settleTimeout = request.body.settle_timeout;
  // TODO: missing reveal timeout, because SDK doesn't support it.

  try {
    await RaidenService.getInstance().openChannel(
      tokenAddress,
      partnerAddress,
      totalDeposit,
      settleTimeout,
    );
  } catch (error) {
    next(error);
  }

  request.channels = RaidenService.getInstance().filterChannels(
    undefined,
    tokenAddress,
    partnerAddress,
  );
  next();
}

export async function updateChannelAndAttach(_request: Request, response: Response) {
  response.status(404).send('Not implemented yet');
}
