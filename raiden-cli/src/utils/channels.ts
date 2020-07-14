import { RaidenChannel, RaidenChannels, ChannelState } from 'raiden-ts';
import { ApiChannel, ApiChannelState } from '../types';

export function flattenChannelDictionary(channelDict: RaidenChannels): RaidenChannel[] {
  // To flatten structure {token: {partner: [channel..], partner:...}, token...}
  return Object.values(channelDict).reduce(
    (allChannels, tokenPartners) => allChannels.concat(Object.values(tokenPartners)),
    [] as RaidenChannel[],
  );
}

function transformSdkChannelStateToApi(state: ChannelState): ApiChannelState {
  let apiState;
  switch (state) {
    case ChannelState.open:
    case ChannelState.closing:
      apiState = ApiChannelState.opened;
      break;
    case ChannelState.closed:
    case ChannelState.settleable:
    case ChannelState.settling:
      apiState = ApiChannelState.closed;
      break;
    case ChannelState.settled:
      apiState = ApiChannelState.settled;
      break;
  }
  return apiState;
}

export function transformSdkChannelFormatToApi(channel: RaidenChannel): ApiChannel {
  return {
    channel_identifier: channel.id,
    token_network_address: channel.tokenNetwork,
    partner_address: channel.partner,
    token_address: channel.token,
    balance: channel.balance.toString(),
    total_deposit: channel.ownDeposit.toString(),
    total_withdraw: channel.ownWithdraw.toString(),
    state: transformSdkChannelStateToApi(channel.state),
    settle_timeout: channel.settleTimeout,
    reveal_timeout: 50, // FIXME: Not defined here. Python client handles reveal timeout differently,
  };
}
