/* eslint-disable @typescript-eslint/camelcase */
import * as t from 'io-ts';
// import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { Address, BigNumberC, Hash, PositiveInt, Secret, Signature } from '../store/types';

// types

const SignedMessage = t.type({
  signature: Signature,
});

const RetrieableMessage = t.type({
  message_identifier: t.Int,
});

const SignedRetrieableMessage = t.intersection([SignedMessage, RetrieableMessage]);

export const Delivered = t.intersection([
  t.type({
    type: t.literal('Delivered'),
    delivered_message_identifier: t.Int,
  }),
  SignedMessage,
]);
export type Delivered = t.TypeOf<typeof Delivered>;

export const Processed = t.intersection([
  t.type({
    type: t.literal('Processed'),
  }),
  SignedRetrieableMessage,
]);
export type Processed = t.TypeOf<typeof Processed>;

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

export const RevealSecret = t.intersection([
  t.type({
    type: t.literal('RevealSecret'),
    secret: Secret,
  }),
  SignedRetrieableMessage,
]);
export type RevealSecret = t.TypeOf<typeof RevealSecret>;

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

const Lock = t.type({
  amount: BigNumberC,
  expiration: PositiveInt,
  secrethash: Hash,
});

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

export const LockedTransfer = t.intersection([
  t.type({
    type: t.literal('LockedTransfer'),
  }),
  LockedTransferBase,
]);
export type LockedTransfer = t.TypeOf<typeof LockedTransfer>;

export const RefundTransfer = t.intersection([
  t.type({
    type: t.literal('RefundTransfer'),
  }),
  LockedTransferBase,
]);
export type RefundTransfer = t.TypeOf<typeof RefundTransfer>;

export const Unlock = t.intersection([
  t.type({
    type: t.literal('Unlock'),
    payment_identifier: t.Int,
    secret: Secret,
  }),
  EnvelopeMessage,
]);
export type Unlock = t.TypeOf<typeof Unlock>;

export const LockExpired = t.intersection([
  t.type({
    type: t.literal('LockExpired'),
    recipient: Address,
    secrethash: Hash,
  }),
  EnvelopeMessage,
]);
export type LockExpired = t.TypeOf<typeof LockExpired>;
