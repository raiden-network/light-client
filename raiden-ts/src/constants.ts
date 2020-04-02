import { padZeros } from 'ethers/utils';

export const SignatureZero = padZeros([], 65);

export enum ShutdownReason {
  STOP = 'raidenStopped',
  ACCOUNT_CHANGED = 'providerAccountChanged',
  NETWORK_CHANGED = 'providerNetworkChanged',
}

export enum Capabilities {
  // opt-out capabilities, for backwards compatibility
  NO_RECEIVE = 'noReceive', // won't proceed with protocol for incoming transfers
  NO_MEDIATE = 'noMediate', // can't mediate transfers; mediating requires receiving
  NO_DELIVERY = 'noDelivery', // don't need Delivery messages
  WEBRTC = 'webRTC', // use WebRTC channels for p2p messaging
}
