import { Router, Request, Response } from 'express';
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
  response.send('version number');
});

router.get('/address', function (_request: Request, response: Response): void {
  response.send('unlocked address');
});

router.get('/status', function (_request: Request, response: Response): void {
  response.send('current status');
});

export default router;
