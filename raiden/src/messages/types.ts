/* eslint-disable @typescript-eslint/camelcase */
/**
 * These io-ts codecs validate and decode JSON Raiden messages
 * They include BigNumber strings validation, enum validation (if needed), Address checksum
 * validation, etc, and converting everything to its respective object, where needed.
 */

import * as t from 'io-ts';
// import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { Address, BigNumberC, Hash, PositiveInt, Secret, Signature } from '../store/types';
import { Lock } from '../channels/types';

// types

// a message that contains a signature
const SignedMessage = t.type({
  signature: Signature,
});

// a message that contains an identifier and is expected to be ack'ed with a respective Delivered
const RetrieableMessage = t.type({
  message_identifier: t.Int,
});

// mixin for both Signed and Retrieable messages
const SignedRetrieableMessage = t.intersection([RetrieableMessage, SignedMessage]);

// Acknowledges to the sender that a RetrieableMessage was received
export const Delivered = t.intersection([
  t.type({
    type: t.literal('Delivered'),
    delivered_message_identifier: t.Int,
  }),
  SignedMessage,
]);
export type Delivered = t.TypeOf<typeof Delivered>;

// Confirms some message that required state validation was successfuly processed
export const Processed = t.intersection([
  t.type({
    type: t.literal('Processed'),
  }),
  SignedRetrieableMessage,
]);
export type Processed = t.TypeOf<typeof Processed>;

// Requests the initiator to reveal the secret for a LockedTransfer targeted to us
export const SecretRequest = t.intersection([
  t.type({
    type: t.literal('SecretRequest'),
    payment_identifier: t.Int,
    secrethash: Hash,
    amount: BigNumberC,
    expiration: PositiveInt,
  }),
  SignedRetrieableMessage,
]);
export type SecretRequest = t.TypeOf<typeof SecretRequest>;

// Reveal to the target or the previous hop a secret we just learned off-chain
export const RevealSecret = t.intersection([
  t.type({
    type: t.literal('RevealSecret'),
    secret: Secret,
  }),
  SignedRetrieableMessage,
]);
export type RevealSecret = t.TypeOf<typeof RevealSecret>;

// Mixin for messages that goes on-chain
const EnvelopeMessage = t.intersection([
  t.type({
    chain_id: PositiveInt,
    nonce: PositiveInt,
    transferred_amount: BigNumberC,
    locked_amount: BigNumberC,
    locksroot: Hash,
    channel_identifier: PositiveInt,
    token_network_address: Address,
  }),
  SignedRetrieableMessage,
]);

// base for locked and refund transfer, they differentiate on the type tag
const LockedTransferBase = t.intersection([
  t.type({
    payment_identifier: t.Int,
    token: Address,
    recipient: Address,
    lock: Lock,
    target: Address,
    initiator: Address,
    // fee: PositiveInt,
  }),
  EnvelopeMessage,
]);

// a mediated locked transfer
export const LockedTransfer = t.intersection([
  t.type({
    type: t.literal('LockedTransfer'),
  }),
  LockedTransferBase,
]);
export type LockedTransfer = t.TypeOf<typeof LockedTransfer>;

// if a mediated transfer didn't succeed, mediator can refund the amount with the same secrethash
// so the previous hop can retry it with another neighbor
export const RefundTransfer = t.intersection([
  t.type({
    type: t.literal('RefundTransfer'),
  }),
  LockedTransferBase,
]);
export type RefundTransfer = t.TypeOf<typeof RefundTransfer>;

// when the secret is revealed, unlock sends a new balance proof without the lock and increasing
// the total transfered to finish the offchain transfer
export const Unlock = t.intersection([
  t.type({
    type: t.literal('Unlock'),
    payment_identifier: t.Int,
    secret: Secret,
  }),
  EnvelopeMessage,
]);
export type Unlock = t.TypeOf<typeof Unlock>;

// after mediated transfer fails and the lock expire, clean it from the locks tree
export const LockExpired = t.intersection([
  t.type({
    type: t.literal('LockExpired'),
    recipient: Address,
    secrethash: Hash,
  }),
  EnvelopeMessage,
]);
export type LockExpired = t.TypeOf<typeof LockExpired>;
