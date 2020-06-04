import { Router } from 'express';
import { validate, isAddress, isAmount, isTimeout, isState } from '../utils/validation';
import {
  attachOpenChannels,
  attachOpenChannelsMatchingTokenAddress,
  attachOpenChannelsMatchingTokenAndPartnerAddress,
  openChannelAndAttach,
  updateChannelAndAttach,
  transformAndSendChannels,
} from '../controllers/channels';

const router = Router();

router.get('/', attachOpenChannels, transformAndSendChannels);
router.get(
  '/:tokenAddress',
  validate([isAddress('tokenAddress', 'params')]),
  attachOpenChannelsMatchingTokenAddress,
  transformAndSendChannels,
);

router.get(
  '/:tokenAddress/:partnerAddress',
  validate([isAddress('tokenAddress', 'params'), isAddress('partnerAddress', 'params')]),
  attachOpenChannelsMatchingTokenAndPartnerAddress,
  transformAndSendChannels,
);

router.put(
  '/',
  validate([
    isAddress('token_address', 'body'),
    isAddress('partner_address', 'body'),
    isAmount('total_deposit', 'body'),
    isTimeout('settle_timeout', 'body'),
    isTimeout('reveal_timeout', 'body'),
  ]),
  openChannelAndAttach,
  transformAndSendChannels,
);

router.patch(
  '/:tokenAddress/:partnerAddress',
  validate([
    isAddress('tokenAddress', 'params'),
    isAddress('partnerAddress', 'params'),
    isState('state', 'body', true),
    isAmount('total_deposit', 'body', true),
    isAmount('total_withdraw', 'body', true),
    isTimeout('reveal_timeout', 'body', true),
  ]),
  updateChannelAndAttach,
  transformAndSendChannels,
);

export default router;
