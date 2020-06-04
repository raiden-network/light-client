/* eslint-disable @typescript-eslint/camelcase */
import { RaidenChannel } from 'raiden-ts';
import { ApiChannel } from '../types';

export function transformChannelFormatSdkToApi(channel: RaidenChannel): ApiChannel {
  return {
    channel_identifier: channel.id ?? 0, // TODO: how can this be undefined?
    token_network_address: channel.tokenNetwork,
    partner_address: channel.partner,
    token_address: channel.token,
    balance: channel.balance.toString(),
    total_deposit: channel.ownDeposit.toString(), // TODO: must this add the partnerDeposit?
    state: channel.state,
    settle_timeout: channel.settleTimeout ?? 0,
    reveal_timeout: 0, // TODO: why not defined?
  } as ApiChannel;
}
