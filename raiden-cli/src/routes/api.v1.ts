/* eslint-disable @typescript-eslint/camelcase */
import { Router, Request, Response } from 'express';
import RaidenService from '../raiden';
import channelsRouter from './channels';
import tokensRouter from './tokens';
import pendingTransfersRouter from './pendingTransfers';
import connectionsRouter from './connections';
import paymentsRouter from './payments';
import testingRouter from './testing';

const router = Router();

router.use('/channels', channelsRouter);
router.use('/tokens', tokensRouter);
router.use('/pending_transfers', pendingTransfersRouter);
router.use('/connections', connectionsRouter);
router.use('/payments', paymentsRouter);
router.use('/testing', testingRouter);

router.get('/version', function (_request: Request, response: Response): void {
  response.json({
    version: RaidenService.version,
  });
});

router.get('/address', function (_request: Request, response: Response): void {
  response.json({
    our_address: RaidenService.getInstance().unlockedAddress,
  });
});

router.get('/status', function (_request: Request, response: Response): void {
  response.json({
    status: RaidenService.status,
    blocks_to_syn: 'unknown', // TODO: How to determine?
  });
});

export default router;
