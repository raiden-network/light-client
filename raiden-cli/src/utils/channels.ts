import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { flatMap, values, map, filter } from 'lodash';
import { ApiChannel } from '../types';

export function flattenChannelDictionary(channelDict: RaidenChannels): RaidenChannel[] {
  // To flatten structure {token: {partner: [channel..], partner:...}, token...}
  return flatMap(values(channelDict), (partnerChannels) => values(partnerChannels));
}

export function filterChannels(
  channels: RaidenChannel[],
  tokenAddress?: string,
  partnerAddress?: string,
): RaidenChannel[] {
  let filteredChannels = channels;

  if (tokenAddress) {
    filteredChannels = filter(filteredChannels, (channel) => channel.token === tokenAddress);
  }
  if (partnerAddress) {
    filteredChannels = filter(filteredChannels, (channel) => channel.partner === partnerAddress);
  }

  return filteredChannels;
}

/* eslint-disable @typescript-eslint/camelcase */
export function transformSdkChannelFormatToApi(channels: RaidenChannel[]): ApiChannel[] {
  return map(channels, (channel) => {
    return {
      channel_identifier: channel.id ?? 0, // FIXME: old "bug" in the SDK
      token_network_address: channel.tokenNetwork,
      partner_address: channel.partner,
      token_address: channel.token,
      balance: channel.balance.toString(),
      total_deposit: channel.ownDeposit.toString(),
      state: channel.state,
      settle_timeout: channel.settleTimeout ?? 0,
      reveal_timeout: 0, // FIXME: Not defined here. Python client handles reveal timeout differently,
    } as ApiChannel;
  });
}
