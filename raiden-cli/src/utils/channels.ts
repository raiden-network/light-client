import { RaidenChannel, RaidenChannels } from 'raiden-ts';
import { ApiChannel } from '../types';

export function flattenChannelDictionary(channelDict: RaidenChannels): RaidenChannel[] {
  // To flatten structure {token: {partner: [channel..], partner:...}, token...}
  return Object.values(channelDict).reduce(
    (allChannels, tokenPartners) => allChannels.concat(Object.values(tokenPartners)),
    [] as RaidenChannel[],
  );
}

export function filterChannels(
  channels: RaidenChannel[],
  tokenAddress?: string,
  partnerAddress?: string,
): RaidenChannel[] {
  let filteredChannels = channels;

  if (tokenAddress) {
    filteredChannels = filteredChannels.filter((channel) => channel.token === tokenAddress);
  }
  if (partnerAddress) {
    filteredChannels = filteredChannels.filter((channel) => channel.token === partnerAddress);
  }

  return filteredChannels;
}

export function transformSdkChannelFormatToApi(channel: RaidenChannel): ApiChannel {
  return {
    channel_identifier: channel.id,
    token_network_address: channel.tokenNetwork,
    partner_address: channel.partner,
    token_address: channel.token,
    balance: channel.balance.toString(),
    total_deposit: channel.ownDeposit.toString(),
    state: channel.state,
    settle_timeout: channel.settleTimeout,
    reveal_timeout: 0, // FIXME: Not defined here. Python client handles reveal timeout differently,
  };
}
