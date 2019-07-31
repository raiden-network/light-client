/* istanbul ignore file */
/* eslint-disable @typescript-eslint/camelcase */
/**
 * These io-ts codecs validate and decode JSON Raiden messages
 * They include BigNumber strings validation, enum validation (if needed), Address checksum
 * validation, etc, and converting everything to its respective object, where needed.
 */
import * as t from 'io-ts';
import { memoize } from 'lodash';
// import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { Address, EnumType, Hash, Secret, Signature, UInt } from '../utils/types';
import { Lock } from '../channels/types';

// types
export enum MessageType {
  DELIVERED = 'Delivered',
  PROCESSED = 'Processed',
  SECRET_REQUEST = 'SecretRequest',
  SECRET_REVEAL = 'RevealSecret',
  LOCKED_TRANSFER = 'LockedTransfer',
  REFUND_TRANSFER = 'RefundTransfer',
  UNLOCK = 'Secret', // TODO: update to post-red-eyes 'Unlock' type tag
  LOCK_EXPIRED = 'LockExpired',
}
export const MessageTypeC = new EnumType<MessageType>(MessageType, 'MessageType');

// Mixin for all tagged messages
export const Message = t.readonly(t.type({ type: MessageTypeC }));

// Mixin of a message that contains an identifier and should be ack'ed with a respective Delivered
const RetrieableMessage = t.readonly(
  t.intersection([
    t.type({
      message_identifier: UInt(8),
    }),
    Message,
  ]),
);

// Acknowledges to the sender that a RetrieableMessage was received
export const Delivered = t.readonly(
  t.intersection([
    t.type({
      type: t.literal(MessageType.DELIVERED),
      delivered_message_identifier: UInt(8),
    }),
    Message,
  ]),
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
      fee: UInt(32),
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

export type Message =
  | Delivered
  | Processed
  | SecretRequest
  | SecretReveal
  | LockedTransfer
  | RefundTransfer
  | Unlock
  | LockExpired;
export type EnvelopeMessage = LockedTransfer | RefundTransfer | Unlock | LockExpired;
// type to require a message to be signed!

// generic type codec for messages that must be signed
// use it like: Codec = Signed(Message)
// The t.TypeOf<typeof codec> will be Signed<Message>, defined later
export const Signed = memoize<
  <C extends t.Mixed>(
    codec: C,
  ) => t.IntersectionC<
    [
      C,
      t.ReadonlyC<
        t.TypeC<{
          signature: typeof Signature;
        }>
      >,
    ]
  >
>(<C extends t.Mixed>(codec: C) =>
  t.intersection([codec, t.readonly(t.type({ signature: Signature }))]),
);
export type Signed<M extends Message> = M & { signature: Signature };

export const SignedMessageCodecs: { readonly [T in MessageType]: t.Mixed } = {
  [MessageType.DELIVERED]: Signed(Delivered),
  [MessageType.PROCESSED]: Signed(Processed),
  [MessageType.SECRET_REQUEST]: Signed(SecretRequest),
  [MessageType.SECRET_REVEAL]: Signed(SecretReveal),
  [MessageType.LOCKED_TRANSFER]: Signed(LockedTransfer),
  [MessageType.REFUND_TRANSFER]: Signed(RefundTransfer),
  [MessageType.UNLOCK]: Signed(Unlock),
  [MessageType.LOCK_EXPIRED]: Signed(LockExpired),
};
