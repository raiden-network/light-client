/**
 * These io-ts codecs validate and decode JSON Raiden messages
 * They include BigNumber strings validation, enum validation (if needed), Address checksum
 * validation, etc, and converting everything to its respective object, where needed.
 */
import * as t from 'io-ts';

import { Address, Hash, Secret, UInt, Int, Signature } from '../utils/types';
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
  WITHDRAW_REQUEST = 'WithdrawRequest',
  WITHDRAW_CONFIRMATION = 'WithdrawConfirmation',
  WITHDRAW_EXPIRED = 'WithdrawExpired',
  PFS_CAPACITY_UPDATE = 'PFSCapacityUpdate',
  PFS_FEE_UPDATE = 'PFSFeeUpdate',
  MONITOR_REQUEST = 'RequestMonitoring',
}

// Mixin of a message that contains an identifier and should be ack'ed with a respective Delivered
const RetrieableMessage = t.readonly(t.type({ message_identifier: UInt(8) }));

// Acknowledges to the sender that a RetrieableMessage was received
const _Delivered = t.readonly(
  t.type({
    type: t.literal(MessageType.DELIVERED),
    delivered_message_identifier: UInt(8),
  }),
);
export interface Delivered extends t.TypeOf<typeof _Delivered> {}
export interface DeliveredC extends t.Type<Delivered, t.OutputOf<typeof _Delivered>> {}
export const Delivered: DeliveredC = _Delivered;

// Confirms some message that required state validation was successfuly processed
const _Processed = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.PROCESSED),
    }),
    RetrieableMessage,
  ]),
);
export interface Processed extends t.TypeOf<typeof _Processed> {}
export interface ProcessedC extends t.Type<Processed, t.OutputOf<typeof _Processed>> {}
export const Processed: ProcessedC = _Processed;

// Requests the initiator to reveal the secret for a LockedTransfer targeted to us
const _SecretRequest = t.readonly(
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
export interface SecretRequest extends t.TypeOf<typeof _SecretRequest> {}
export interface SecretRequestC extends t.Type<SecretRequest, t.OutputOf<typeof _SecretRequest>> {}
export const SecretRequest: SecretRequestC = _SecretRequest;

// Reveal to the target or the previous hop a secret we just learned off-chain
const _SecretReveal = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.SECRET_REVEAL),
      secret: Secret,
    }),
    RetrieableMessage,
  ]),
);
export interface SecretReveal extends t.TypeOf<typeof _SecretReveal> {}
export interface SecretRevealC extends t.Type<SecretReveal, t.OutputOf<typeof _SecretReveal>> {}
export const SecretReveal: SecretRevealC = _SecretReveal;

// Mixin for messages containing a balance proof
const EnvelopeMessage = t.readonly(
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

const _RouteMetadata = t.readonly(
  t.type({
    route: t.readonlyArray(Address),
  }),
);
export interface RouteMetadata extends t.TypeOf<typeof _RouteMetadata> {}
export interface RouteMetadataC extends t.Type<RouteMetadata, t.OutputOf<typeof _RouteMetadata>> {}
export const RouteMetadata: RouteMetadataC = _RouteMetadata;

const _Metadata = t.readonly(
  t.type({
    routes: t.readonlyArray(RouteMetadata),
  }),
);
export interface Metadata extends t.TypeOf<typeof _Metadata> {}
export interface MetadataC extends t.Type<Metadata, t.OutputOf<typeof _Metadata>> {}
export const Metadata: MetadataC = _Metadata;

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
const _LockedTransfer = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.LOCKED_TRANSFER),
    }),
    LockedTransferBase,
  ]),
);
export interface LockedTransfer extends t.TypeOf<typeof _LockedTransfer> {}
export interface LockedTransferC
  extends t.Type<LockedTransfer, t.OutputOf<typeof _LockedTransfer>> {}
export const LockedTransfer: LockedTransferC = _LockedTransfer;

// if a mediated transfer didn't succeed, mediator can refund the amount with the same secrethash
// so the previous hop can retry it with another neighbor
const _RefundTransfer = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.REFUND_TRANSFER),
    }),
    LockedTransferBase,
  ]),
);
export interface RefundTransfer extends t.TypeOf<typeof _RefundTransfer> {}
export interface RefundTransferC
  extends t.Type<RefundTransfer, t.OutputOf<typeof _RefundTransfer>> {}
export const RefundTransfer: RefundTransferC = _RefundTransfer;

// when the secret is revealed, unlock sends a new balance proof without the lock and increasing
// the total transfered to finish the offchain transfer
const _Unlock = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.UNLOCK),
      payment_identifier: UInt(8),
      secret: Secret,
    }),
    EnvelopeMessage,
  ]),
);
export interface Unlock extends t.TypeOf<typeof _Unlock> {}
export interface UnlockC extends t.Type<Unlock, t.OutputOf<typeof _Unlock>> {}
export const Unlock: UnlockC = _Unlock;

// after mediated transfer fails and the lock expire, clean it from the locks tree
const _LockExpired = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.LOCK_EXPIRED),
      recipient: Address,
      secrethash: Hash,
    }),
    EnvelopeMessage,
  ]),
);
export interface LockExpired extends t.TypeOf<typeof _LockExpired> {}
export interface LockExpiredC extends t.Type<LockExpired, t.OutputOf<typeof _LockExpired>> {}
export const LockExpired: LockExpiredC = _LockExpired;

const WithdrawBase = t.readonly(
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

const _WithdrawRequest = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_REQUEST),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawRequest extends t.TypeOf<typeof _WithdrawRequest> {}
export interface WithdrawRequestC
  extends t.Type<WithdrawRequest, t.OutputOf<typeof _WithdrawRequest>> {}
export const WithdrawRequest: WithdrawRequestC = _WithdrawRequest;

const _WithdrawConfirmation = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_CONFIRMATION),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawConfirmation extends t.TypeOf<typeof _WithdrawConfirmation> {}
export interface WithdrawConfirmationC
  extends t.Type<WithdrawConfirmation, t.OutputOf<typeof _WithdrawConfirmation>> {}
export const WithdrawConfirmation: WithdrawConfirmationC = _WithdrawConfirmation;

const _WithdrawExpired = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.WITHDRAW_EXPIRED),
    }),
    WithdrawBase,
    RetrieableMessage,
  ]),
);
export interface WithdrawExpired extends t.TypeOf<typeof _WithdrawExpired> {}
export interface WithdrawExpiredC
  extends t.Type<WithdrawExpired, t.OutputOf<typeof _WithdrawExpired>> {}
export const WithdrawExpired: WithdrawExpiredC = _WithdrawExpired;

const _PFSCapacityUpdate = t.readonly(
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
export interface PFSCapacityUpdate extends t.TypeOf<typeof _PFSCapacityUpdate> {}
export interface PFSCapacityUpdateC
  extends t.Type<PFSCapacityUpdate, t.OutputOf<typeof _PFSCapacityUpdate>> {}
export const PFSCapacityUpdate: PFSCapacityUpdateC = _PFSCapacityUpdate;

const _PFSFeeUpdate = t.readonly(
  t.type({
    type: t.literal(MessageType.PFS_FEE_UPDATE),
    canonical_identifier: t.readonly(
      t.type({
        chain_identifier: UInt(32),
        token_network_address: Address,
        channel_identifier: UInt(32),
      }),
    ),
    updating_participant: Address,
    timestamp: t.string,
    fee_schedule: t.type({
      cap_fees: t.boolean,
      // if not null, it should be an array of [tokenAmount, fee] tuples
      imbalance_penalty: t.union([t.null, t.array(t.tuple([UInt(32), Int(32)]))]),
      proportional: Int(32),
      flat: Int(32),
    }),
  }),
);
export interface PFSFeeUpdate extends t.TypeOf<typeof _PFSFeeUpdate> {}
export interface PFSFeeUpdateC extends t.Type<PFSFeeUpdate, t.OutputOf<typeof _PFSFeeUpdate>> {}
export const PFSFeeUpdate: PFSFeeUpdateC = _PFSFeeUpdate;

const _MonitorRequest = t.readonly(
  t.type({
    type: t.literal(MessageType.MONITOR_REQUEST),
    balance_proof: t.type({
      chain_id: UInt(32),
      token_network_address: Address,
      channel_identifier: UInt(32),
      nonce: UInt(8),
      balance_hash: Hash,
      additional_hash: Hash,
      signature: Signature,
    }),
    monitoring_service_contract_address: Address,
    non_closing_participant: Address,
    non_closing_signature: Signature,
    reward_amount: UInt(32),
  }),
);
export interface MonitorRequest extends t.TypeOf<typeof _MonitorRequest> {}
export interface MonitorRequestC
  extends t.Type<MonitorRequest, t.OutputOf<typeof _MonitorRequest>> {}
export const MonitorRequest: MonitorRequestC = _MonitorRequest;

const messages = [
  Delivered,
  Processed,
  SecretRequest,
  SecretReveal,
  LockedTransfer,
  RefundTransfer,
  Unlock,
  LockExpired,
  WithdrawRequest,
  WithdrawConfirmation,
  WithdrawExpired,
  PFSCapacityUpdate,
  PFSFeeUpdate,
  MonitorRequest,
] as const;

// prefer an explicit union to have the union of the interfaces, instead of the union of t.TypeOf's
export type Message = t.TypeOf<typeof messages[number]>;
export interface MessageC extends t.Type<Message, t.OutputOf<typeof messages[number]>> {}
export const Message: MessageC = t.union([...messages]);
export type EnvelopeMessage = LockedTransfer | RefundTransfer | Unlock | LockExpired;
