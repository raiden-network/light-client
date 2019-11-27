/* istanbul ignore file */
/* eslint-disable @typescript-eslint/camelcase */
/**
 * These io-ts codecs validate and decode JSON Raiden messages
 * They include BigNumber strings validation, enum validation (if needed), Address checksum
 * validation, etc, and converting everything to its respective object, where needed.
 */
import * as t from 'io-ts';
// import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { Address, Hash, Secret, UInt } from '../utils/types';
import { Lock } from '../channels/types';

// types
export enum MessageType {
  DELIVERED = 'Delivered',
  PROCESSED = 'Processed',
  SECRET_REQUEST = 'SecretRequest',
  SECRET_REVEAL = 'RevealSecret',
  LOCKED_TRANSFER = 'LockedTransfer',
  REFUND_TRANSFER = 'RefundTransfer',
  UNLOCK = 'Unlock',
  LOCK_EXPIRED = 'LockExpired',
  TO_DEVICE = 'ToDevice',
  WITHDRAW_REQUEST = 'WithdrawRequest',
  WITHDRAW_CONFIRMATION = 'WithdrawConfirmation',
  WITHDRAW_EXPIRED = 'WithdrawExpired',
  PFS_CAPACITY_UPDATE = 'PFSCapacityUpdate',
}

// Mixin of a message that contains an identifier and should be ack'ed with a respective Delivered
const RetrieableMessage = t.readonly(t.type({ message_identifier: UInt(8) }));

// Acknowledges to the sender that a RetrieableMessage was received
export const Delivered = t.readonly(
  t.type({
    type: t.literal(MessageType.DELIVERED),
    delivered_message_identifier: UInt(8),
  }),
);
export interface Delivered extends t.TypeOf<typeof Delivered> {}

// Confirms some message that required state validation was successfuly processed
export const Processed = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.PROCESSED),
    }),
    RetrieableMessage,
  ]),
);
export interface Processed extends t.TypeOf<typeof Processed> {}

// Requests the initiator to reveal the secret for a LockedTransfer targeted to us
export const SecretRequest = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.SECRET_REQUEST),
      payment_identifier: UInt(8),
      secrethash: Hash,
      amount: UInt(32),
      expiration: UInt(32),
    }),
    RetrieableMessage,
  ]),
);
export interface SecretRequest extends t.TypeOf<typeof SecretRequest> {}

// Reveal to the target or the previous hop a secret we just learned off-chain
export const SecretReveal = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.SECRET_REVEAL),
      secret: Secret,
    }),
    RetrieableMessage,
  ]),
);
export interface SecretReveal extends t.TypeOf<typeof SecretReveal> {}

// Mixin for messages containing a balance proof
export const EnvelopeMessage = t.readonly(
  t.intersection([
    t.type({
      chain_id: UInt(32),
      token_network_address: Address,
      channel_identifier: UInt(32),
      nonce: UInt(8),
      transferred_amount: UInt(32),
      locked_amount: UInt(32),
      locksroot: Hash,
    }),
    RetrieableMessage,
  ]),
);

export const RouteMetadata = t.readonly(
  t.type({
    route: t.readonlyArray(Address),
  }),
);
export interface RouteMetadata extends t.TypeOf<typeof RouteMetadata> {}

export const Metadata = t.readonly(
  t.type({
    routes: t.readonlyArray(RouteMetadata),
  }),
);
export interface Metadata extends t.TypeOf<typeof Metadata> {}

// base for locked and refund transfer, they differentiate only on the type tag
const LockedTransferBase = t.readonly(
  t.intersection([
    t.type({
      payment_identifier: UInt(8),
      token: Address,
      recipient: Address,
      lock: Lock,
      target: Address,
      initiator: Address,
      metadata: Metadata,
    }),
    EnvelopeMessage,
  ]),
);

// a mediated transfer containing a locked amount
export const LockedTransfer = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.LOCKED_TRANSFER),
    }),
    LockedTransferBase,
  ]),
);
export interface LockedTransfer extends t.TypeOf<typeof LockedTransfer> {}

// if a mediated transfer didn't succeed, mediator can refund the amount with the same secrethash
// so the previous hop can retry it with another neighbor
export const RefundTransfer = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.REFUND_TRANSFER),
    }),
    LockedTransferBase,
  ]),
);
export interface RefundTransfer extends t.TypeOf<typeof RefundTransfer> {}

// when the secret is revealed, unlock sends a new balance proof without the lock and increasing
// the total transfered to finish the offchain transfer
export const Unlock = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.UNLOCK),
      payment_identifier: UInt(8),
      secret: Secret,
    }),
    EnvelopeMessage,
  ]),
);
export interface Unlock extends t.TypeOf<typeof Unlock> {}

// after mediated transfer fails and the lock expire, clean it from the locks tree
export const LockExpired = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.LOCK_EXPIRED),
      recipient: Address,
      secrethash: Hash,
    }),
    EnvelopeMessage,
  ]),
);
export interface LockExpired extends t.TypeOf<typeof LockExpired> {}

export const ToDevice = t.readonly(
  t.type({
    type: t.literal(MessageType.TO_DEVICE),
    message_identifier: UInt(8),
  }),
);
export interface ToDevice extends t.TypeOf<typeof ToDevice> {}

export const WithdrawBase = t.readonly(
  t.type({
    chain_id: UInt(32),
    token_network_address: Address,
    channel_identifier: UInt(32),
    participant: Address,
    total_withdraw: UInt(32),
    nonce: UInt(8),
    expiration: UInt(32),
  }),
);

export const WithdrawRequest = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_REQUEST),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawRequest extends t.TypeOf<typeof WithdrawRequest> {}

export const WithdrawConfirmation = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_CONFIRMATION),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawConfirmation extends t.TypeOf<typeof WithdrawConfirmation> {}

export const WithdrawExpired = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_EXPIRED),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawExpired extends t.TypeOf<typeof WithdrawExpired> {}

export const PFSCapacityUpdate = t.readonly(
  t.type({
    type: t.literal(MessageType.PFS_CAPACITY_UPDATE),
    canonical_identifier: t.readonly(
      t.type({
        chain_identifier: UInt(32),
        token_network_address: Address,
        channel_identifier: UInt(32),
      }),
    ),
    updating_participant: Address,
    other_participant: Address,
    updating_nonce: UInt(8),
    other_nonce: UInt(8),
    updating_capacity: UInt(32),
    other_capacity: UInt(32),
    reveal_timeout: UInt(32),
  }),
);
export interface PFSCapacityUpdate extends t.TypeOf<typeof PFSCapacityUpdate> {}

export const Message = t.union([
  Delivered,
  Processed,
  SecretRequest,
  SecretReveal,
  LockedTransfer,
  RefundTransfer,
  Unlock,
  LockExpired,
  ToDevice,
  WithdrawRequest,
  WithdrawConfirmation,
  WithdrawExpired,
  PFSCapacityUpdate,
]);
// prefer an explicit union to have the union of the interfaces, instead of the union of t.TypeOf's
export type Message =
  | Delivered
  | Processed
  | SecretRequest
  | SecretReveal
  | LockedTransfer
  | RefundTransfer
  | Unlock
  | LockExpired
  | ToDevice
  | WithdrawRequest
  | WithdrawConfirmation
  | WithdrawExpired
  | PFSCapacityUpdate;
export type EnvelopeMessage = LockedTransfer | RefundTransfer | Unlock | LockExpired;
