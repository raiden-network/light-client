import type { Request, Response } from 'express';
import { Router } from 'express';

import type { RaidenTransfer } from 'raiden-ts';

import type { Cli } from '../types';
import { queryAsNumbers, validateOptionalAddressParameter } from '../utils/validation';

export enum ApiTransferRole {
  initiator = 'initiator',
  mediator = 'mediator',
  target = 'target,',
}

export interface ApiTransfer {
  channel_identifier: string;
  initiator: string;
  locked_amount: string;
  payment_identifier: string;
  role: ApiTransferRole;
  target: string;
  token_address: string;
  token_network_address: string;
  transferred_amount: string;
}

function transformSdkToApiPendingTransfer(
  this: Cli,
  transfer: RaidenTransfer,
): ApiTransfer | undefined {
  let role: ApiTransferRole;
  if (transfer.direction === 'sent' && transfer.initiator === this.raiden.address)
    role = ApiTransferRole.initiator;
  else if (transfer.direction === 'received' && transfer.target === this.raiden.address)
    role = ApiTransferRole.target;
  else if (transfer.direction === 'sent') role = ApiTransferRole.mediator;
  else return; // filter out duplicated 'received' side of mediated transfers
  return {
    channel_identifier: transfer.channelId.toString(),
    initiator: transfer.initiator,
    locked_amount: transfer.amount.toString(),
    payment_identifier: transfer.paymentId.toString(),
    role,
    target: transfer.target,
    token_address: transfer.token,
    token_network_address: transfer.tokenNetwork,
    transferred_amount: transfer.amount.sub(transfer.fee).toString(),
  };
}

async function getPendingTransfers(this: Cli, request: Request, response: Response) {
  let filter: Parameters<typeof this.raiden['getTransfers']>[0];
  if (request.params.tokenAddress) {
    filter = { pending: true, token: request.params.tokenAddress };
    if (request.params.partnerAddress) filter['partner'] = request.params.partnerAddress;
  } else filter = { pending: true };

  this.raiden
    .getTransfers(filter, queryAsNumbers(request.query))
    .then((transfers) => transfers.map(transformSdkToApiPendingTransfer))
    .then(
      (r) => response.json(r),
      (e) => {
        this.log.error(e);
        response.status(400).send(e);
      },
    );
}

/**
 * @param this - Cli object
 * @returns Router instance
 */
export function makePendingTransfersRouter(this: Cli): Router {
  const router = Router();

  router.get(
    '/:tokenAddress?/:partnerAddress?',
    validateOptionalAddressParameter.bind('tokenAddress'),
    validateOptionalAddressParameter.bind('partnerAddress'),
    getPendingTransfers.bind(this),
  );

  return router;
}
