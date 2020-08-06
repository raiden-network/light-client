import { InitEpics } from './init';
import { PresenceEpics } from './presence';
import { RoomsEpics } from './rooms';
import { MessagesEpics } from './messages';
import { WebRTCEpics } from './webrtc';

export const TransportEpics = [
  ...InitEpics,
  ...PresenceEpics,
  ...RoomsEpics,
  ...MessagesEpics,
  ...WebRTCEpics,
];
