import { padZeros, hexlify, keccak256 } from 'ethers/utils';
import { Signature, Hash } from './utils/types';

export const SignatureZero = hexlify(padZeros([], 65)) as Signature;

// LocksrootZero = getLocksroot([]) = '0xc5d2...a470';
export const LocksrootZero = keccak256([]) as Hash;

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
