import { Router, Request, Response } from 'express';
import { Raiden } from 'raiden-ts';
import { Cli } from '../types';
import { makeChannelsRouter } from './channels';
import { makeConnectionsRouter } from './connections';
import { makePaymentsRouter } from './payments';
import { makePendingTransfersRouter } from './pendingTransfers';
import { makeTestingRouter } from './testing';
import { makeTokensRouter } from './tokens';

export function makeApiV1Router(this: Cli): Router {
  const router = Router();

  router.use('/channels', makeChannelsRouter.call(this));
  router.use('/tokens', makeTokensRouter.call(this));
  router.use('/pending_transfers', makePendingTransfersRouter.call(this));
  router.use('/connections', makeConnectionsRouter.call(this));
  router.use('/payments', makePaymentsRouter.call(this));
  router.use('/testing', makeTestingRouter.call(this));

  router.get('/version', (_request: Request, response: Response) => {
    response.json({
      version: Raiden.version,
    });
  });

  router.get('/address', (_request: Request, response: Response) => {
    response.json({
      our_address: this.raiden.address,
    });
  });

  router.get('/status', (_request: Request, response: Response) => {
    response.json({
      status: this.raiden.started
        ? 'ready'
        : this.raiden.started === undefined // not yet started
        ? 'syncing'
        : 'unavailable',
      blocks_to_sync: '0', // LC don't sync block-by-block, it syncs immediately once started
    });
  });

  router.post('/shutdown', (_request: Request, response: Response) => {
    this.raiden.stop();
    response.json({ status: 'shutdown' });
  });

  return router;
}
