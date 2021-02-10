import type { Request, Response } from 'express';
import { Router } from 'express';

import { Raiden, RaidenConfig } from 'raiden-ts';

import type { Cli } from '../types';
import { makeChannelsRouter } from './channels';
import { makeConnectionsRouter } from './connections';
import { makePaymentsRouter } from './payments';
import { makePendingTransfersRouter } from './pendingTransfers';
import { makeTestingRouter } from './testing';
import { makeTokensRouter } from './tokens';

/**
 * Make a Raiden APIv1 router, with all its bound endpoints
 *
 * @param this - Cli object
 * @returns Set up router
 */
export function makeApiV1Router(this: Cli): Router {
  const router = Router();

  let status = 'syncing';
  this.raiden.synced.then(() => {
    status = 'ready';

    // register these routes only when finished syncing
    router.use('/channels', makeChannelsRouter.call(this));
    router.use('/tokens', makeTokensRouter.call(this));
    router.use('/pending_transfers', makePendingTransfersRouter.call(this));
    router.use('/connections', makeConnectionsRouter.call(this));
    router.use('/payments', makePaymentsRouter.call(this));
    router.use('/_testing', makeTestingRouter.call(this));
  });

  router.get('/version', (_request: Request, response: Response) => {
    response.json({ version: Raiden.version });
  });

  router.get('/contracts', (_request: Request, response: Response) => {
    const contracts = this.raiden.contractsInfo;
    response.json({
      contracts_version: Raiden.contractVersion,
      token_network_registry_address: contracts.TokenNetworkRegistry.address,
      secret_registry_address: contracts.SecretRegistry.address,
      service_registry_address: contracts.ServiceRegistry.address,
      user_deposit_address: contracts.UserDeposit.address,
      monitoring_service_address: contracts.MonitoringService.address,
      one_to_n_address: '',
    });
  });

  router.get('/address', (_request: Request, response: Response) => {
    response.json({ our_address: this.raiden.address });
  });

  router.get('/status', (_request: Request, response: Response) => {
    response.json({
      status: this.raiden.started ? status : 'unavailable',
      blocks_to_sync: '0', // LC don't sync block-by-block, it syncs immediately once started
    });
  });

  router.post('/shutdown', (_request: Request, response: Response) => {
    this.raiden.stop();
    response.json({ status: 'shutdown' });
  });

  // config endpoints aren't on Raiden spec, but are useful for CLI & SDK management
  router.get('/config', (_request: Request, response: Response) => {
    response.json(RaidenConfig.encode(this.raiden.config));
  });

  router.patch('/config', (request: Request, response: Response) => {
    this.raiden.updateConfig(request.body);
    response.json(RaidenConfig.encode(this.raiden.config));
  });

  return router;
}
