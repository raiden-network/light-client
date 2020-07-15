import { Router, Request, Response } from 'express';
import { timer } from 'rxjs';
import { filter, takeUntil, map, toArray } from 'rxjs/operators';
import { RaidenTransfer, isntNil } from 'raiden-ts';

import { Cli } from '../types';
import { validateOptionalAddressParameter } from '../utils/validation';

enum ApiRole {
  initiator = 'initiator',
  mediator = 'mediator',
  target = 'target,',
}

function transformSdkToApiPendingTransfer(this: Cli, transfer: RaidenTransfer) {
  let role: ApiRole;
  if (transfer.direction === 'sent' && transfer.initiator === this.raiden.address)
    role = ApiRole.initiator;
  else if (transfer.direction === 'received' && transfer.target === this.raiden.address)
    role = ApiRole.target;
  else if (transfer.direction === 'sent') role = ApiRole.mediator;
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
  this.raiden.transfers$
    .pipe(
      filter((transfer) => !transfer.completed),
      filter(
        (transfer) =>
          !request.params.tokenAddress || request.params.tokenAddress === transfer.token,
      ),
      filter(
        (transfer) =>
          !request.params.partnerAddress || request.params.partnerAddress === transfer.partner,
      ),
      takeUntil(timer(0)),
      map(transformSdkToApiPendingTransfer.bind(this)),
      filter(isntNil),
      toArray(),
    )
    .subscribe((transfers) => response.json(transfers));
}

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
