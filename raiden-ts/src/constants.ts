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
  DELIVERY = 'Delivery', // whether Delivered messages are needed
  RECEIVE = 'Receive', // whether to proceed with protocol for incoming transfers
  MEDIATE = 'Mediate', // whether to mediate transfers; requires receiving
  WEBRTC = 'webRTC', // use WebRTC channels for p2p messaging
  TO_DEVICE = 'toDevice', // use ToDevice messages instead of rooms
}

export const CapsFallback = {
  [Capabilities.DELIVERY]: 1,
  [Capabilities.RECEIVE]: 1,
  [Capabilities.MEDIATE]: 1,
  [Capabilities.WEBRTC]: 0,
  [Capabilities.TO_DEVICE]: 0,
} as const;
