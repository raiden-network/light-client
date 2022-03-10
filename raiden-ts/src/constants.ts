import { hexZeroPad } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { parseEther } from '@ethersproject/units';

import type { Hash, Signature, UInt } from './utils/types';

export const SignatureZero = hexZeroPad([], 65) as Signature;

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
  IMMUTABLE_METADATA = 'immutableMetadata', // passthrough metadata unchanged
}

export const CapsFallback = {
  [Capabilities.DELIVERY]: 1,
  [Capabilities.RECEIVE]: 1,
  [Capabilities.MEDIATE]: 1,
  [Capabilities.WEBRTC]: 0,
  [Capabilities.TO_DEVICE]: 1,
  [Capabilities.IMMUTABLE_METADATA]: 0,
} as const;

export const RAIDEN_DEVICE_ID = 'RAIDEN';
export const DEFAULT_CONFIRMATIONS = 5; // in blocks
export const DEFAULT_POLLING_INTERVAL = 5; // in seconds
export const DEFAULT_MS_REWARD = parseEther('80') as UInt<32>; // 80 SVT
export const DEFAULT_REVEAL_TIMEOUT = 10 * 60; // 10min in seconds
export const DEFAULT_PFS_IOU_TIMEOUT = 60 * 60 * 24 * 30; // 30 days in seconds
export const DEFAULT_PFS_MAX_PATHS = 3;
