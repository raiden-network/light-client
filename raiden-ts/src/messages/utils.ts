import * as t from 'io-ts';
import { Signer } from 'ethers/abstract-signer';
import { keccak256, RLP, verifyMessage } from 'ethers/utils';
import { arrayify, concat, hexlify } from 'ethers/utils/bytes';
import { HashZero } from 'ethers/constants';
import logging from 'loglevel';

import { Address, Hash, HexString, Signature, UInt, Signed, decode, assert } from '../utils/types';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { SignedBalanceProof } from '../channels/types';
import { EnvelopeMessage, Message, MessageType, Metadata } from './types';
import { messageReceived } from './actions';

const CMDIDs: { readonly [T in MessageType]: number } = {
  [MessageType.DELIVERED]: 12,
  [MessageType.PROCESSED]: 0,
  [MessageType.SECRET_REQUEST]: 3,
  [MessageType.SECRET_REVEAL]: 11,
  [MessageType.LOCKED_TRANSFER]: 7,
  [MessageType.REFUND_TRANSFER]: 8,
  [MessageType.UNLOCK]: 4,
  [MessageType.LOCK_EXPIRED]: 13,
  [MessageType.WITHDRAW_REQUEST]: 15,
  [MessageType.WITHDRAW_CONFIRMATION]: 16,
  [MessageType.WITHDRAW_EXPIRED]: 17,
  [MessageType.PFS_CAPACITY_UPDATE]: -1,
};

// raiden_contracts.constants.MessageTypeId
export enum MessageTypeId {
  BALANCE_PROOF = 1,
  WITHDRAW = 3,
  IOU = 5,
}

/**
 * Create the hash of Metadata structure.
 *
 * @param metadata - The LockedTransfer metadata
 * @returns Hash of the metadata.
 */
export function createMetadataHash(metadata: Metadata): Hash {
  const routeHashes = metadata.routes.map((value) => keccak256(RLP.encode(value.route)) as Hash);
  return keccak256(RLP.encode(routeHashes)) as Hash;
}

/**
 * Returns a balance_hash from transferred&locked amounts & locksroot
 *
 * @param transferredAmount - EnvelopeMessage.transferred_amount
 * @param lockedAmount - EnvelopeMessage.locked_amount
 * @param locksroot - Hash of all current locks
 * @returns Hash of the balance
 */
export function createBalanceHash(
  transferredAmount: UInt<32>,
  lockedAmount: UInt<32>,
  locksroot: Hash,
): Hash {
  return (transferredAmount.isZero() && lockedAmount.isZero() && locksroot === HashZero
    ? HashZero
    : keccak256(
        concat([encode(transferredAmount, 32), encode(lockedAmount, 32), encode(locksroot, 32)]),
      )) as Hash;
}

/**
 * Create the messageHash for a given EnvelopeMessage
 *
 * @param message - EnvelopeMessage to pack
 * @returns Hash of the message pack
 */
export function createMessageHash(message: EnvelopeMessage): Hash {
  switch (message.type) {
    case MessageType.LOCKED_TRANSFER:
    case MessageType.REFUND_TRANSFER:
      // hash of packed representation of the whole message
      let packed = concat([
        encode(CMDIDs[message.type], 1),
        encode(message.message_identifier, 8),
        encode(message.payment_identifier, 8),
        encode(message.lock.expiration, 32),
        encode(message.token, 20),
        encode(message.recipient, 20),
        encode(message.target, 20),
        encode(message.initiator, 20),
        encode(message.lock.secrethash, 32),
        encode(message.lock.amount, 32),
      ]);

      if (message.type === MessageType.LOCKED_TRANSFER)
        packed = concat([packed, createMetadataHash(message.metadata)]);
      return keccak256(packed) as Hash;
    case MessageType.UNLOCK:
      return keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.secret, 32),
        ]),
      ) as Hash;
    case MessageType.LOCK_EXPIRED:
      return keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(message.message_identifier, 8),
          encode(message.recipient, 20),
          encode(message.secrethash, 32),
        ]),
      ) as Hash;
  }
}

/**
 * Pack a message in a hex-string format, **without** signature
 * This packed hex-byte-array can then be used for signing.
 * On Raiden python client, this is the output of `_data_to_sign` method of the messages, as the
 * actual packed encoding was once used for binary transport protocols, but nowadays is used only
 * for generating data to be signed, which is the purpose of our implementation.
 *
 * @param message - Message to be packed
 * @returns HexBytes hex-encoded string data representing message in binary format
 */
export function packMessage(message: Message) {
  switch (message.type) {
    case MessageType.DELIVERED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.delivered_message_identifier, 8),
        ]),
      ) as HexString<12>;
    case MessageType.PROCESSED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.message_identifier, 8),
        ]),
      ) as HexString<12>;
    case MessageType.LOCKED_TRANSFER:
    case MessageType.REFUND_TRANSFER:
    case MessageType.UNLOCK:
    case MessageType.LOCK_EXPIRED: {
      const messageHash = createMessageHash(message),
        balanceHash = createBalanceHash(
          message.transferred_amount,
          message.locked_amount,
          message.locksroot,
        );
      return hexlify(
        concat([
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(MessageTypeId.BALANCE_PROOF, 32),
          encode(message.channel_identifier, 32),
          encode(balanceHash, 32), // balance hash
          encode(message.nonce, 32),
          encode(messageHash, 32), // additional hash
        ]),
      ) as HexString<212>;
    }
    case MessageType.SECRET_REQUEST:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.secrethash, 32),
          encode(message.amount, 32),
          encode(message.expiration, 32),
        ]),
      ) as HexString<116>;
    case MessageType.SECRET_REVEAL:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.message_identifier, 8),
          encode(message.secret, 32),
        ]),
      ) as HexString<44>;
    case MessageType.WITHDRAW_REQUEST:
    case MessageType.WITHDRAW_CONFIRMATION:
      return hexlify(
        concat([
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(MessageTypeId.WITHDRAW, 32),
          encode(message.channel_identifier, 32),
          encode(message.participant, 20),
          encode(message.total_withdraw, 32),
          encode(message.expiration, 32),
        ]),
      ) as HexString<200>;
    case MessageType.WITHDRAW_EXPIRED:
      return hexlify(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.nonce, 32),
          encode(message.message_identifier, 8),
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(MessageTypeId.WITHDRAW, 32),
          encode(message.channel_identifier, 32),
          encode(message.participant, 20),
          encode(message.total_withdraw, 32),
          encode(message.expiration, 32),
        ]),
      ) as HexString<244>;
    case MessageType.PFS_CAPACITY_UPDATE:
      return hexlify(
        concat([
          encode(message.canonical_identifier.chain_identifier, 32),
          encode(message.canonical_identifier.token_network_address, 20),
          encode(message.canonical_identifier.channel_identifier, 32),
          encode(message.updating_participant, 20),
          encode(message.other_participant, 20),
          encode(message.updating_nonce, 8),
          encode(message.other_nonce, 8),
          encode(message.updating_capacity, 32),
          encode(message.other_capacity, 32),
          encode(message.reveal_timeout, 32),
        ]),
      ) as HexString<236>;
  }
}

/**
 * Typeguard to check if a message contains a valid signature
 *
 * @param message - May or may not be a signed message
 * @returns Boolean if message is signed
 */
export function isSigned<M extends Message & { signature?: Signature }>(
  message: M,
): message is Signed<M> {
  return Signature.is(message.signature);
}

/**
 * Requires a signed message and returns its signer address
 *
 * @param message - Signed message to retrieve signer address
 * @returns Address which signed message
 */
export function getMessageSigner(message: Signed<Message>): Address {
  return verifyMessage(arrayify(packMessage(message)), message.signature) as Address;
}

/**
 * Get the SignedBalanceProof associated with an EnvelopeMessage
 *
 * @param message - Signed EnvelopeMessage
 * @returns SignedBalanceProof object for message
 */
export function getBalanceProofFromEnvelopeMessage(
  message: Signed<EnvelopeMessage>,
): SignedBalanceProof {
  return {
    chainId: message.chain_id,
    tokenNetworkAddress: message.token_network_address,
    channelId: message.channel_identifier,
    nonce: message.nonce,
    transferredAmount: message.transferred_amount,
    lockedAmount: message.locked_amount,
    locksroot: message.locksroot,
    messageHash: createMessageHash(message),
    signature: message.signature,
    sender: getMessageSigner(message),
  };
}

/**
 * Encode a Message as a JSON string
 * Uses lossless-json to encode BigNumbers as JSON 'string' type, as Raiden
 *
 * @param message - Message object to be serialized
 * @returns JSON string
 */
export function encodeJsonMessage(message: Message | Signed<Message>): string {
  if ('signature' in message) return losslessStringify(Signed(Message).encode(message));
  return losslessStringify(Message.encode(message));
}

/**
 * Try to decode text as a Message, using lossless-json to decode BigNumbers
 * Throws if can't decode, or message is invalid regarding any of the encoded constraints
 *
 * @param text - JSON string to try to decode
 * @returns Message object
 */
export function decodeJsonMessage(text: string): Message | Signed<Message> {
  const parsed = losslessParse(text);
  assert(
    parsed &&
      typeof parsed === 'object' &&
      'type' in parsed &&
      Object.values(MessageType).some((t) => t === parsed['type']),
    `Invalid message type: ${parsed?.['type']}`,
  );
  if ('signature' in parsed) return decode(Signed(Message), parsed);
  return decode(Message, parsed);
}

/**
 * Pack message and request signer to sign it, and returns signed message
 *
 * @param signer - Signer instance
 * @param message - Unsigned message to pack and sign
 * @returns Promise to signed message
 */
export async function signMessage<M extends Message>(
  signer: Signer,
  message: M,
  { log }: { log: logging.Logger } = { log: logging },
): Promise<Signed<M>> {
  if (isSigned(message)) return message;
  log.debug(`Signing message "${message.type}"`, message);
  const signature = (await signer.signMessage(arrayify(packMessage(message)))) as Signature;
  return { ...message, signature };
}

/**
 * Type of a specific messageReceived action which validates & narrows payload.message type
 */
export type messageReceivedTyped<M extends Message> = messageReceived & {
  payload: { message: M };
};

/**
 * Typeguard to ensure an action is a messageReceived of any of a set of Message types
 *
 * @param messageCodecs - Message codec to test action.payload.message against
 * @returns Typeguard intersecting messageReceived action and payload.message schemas
 */
export function isMessageReceivedOfType<C extends t.Mixed>(messageCodecs: C | [C, C, ...C[]]) {
  return (action: unknown): action is messageReceivedTyped<t.TypeOf<C>> =>
    messageReceived.is(action) &&
    (Array.isArray(messageCodecs)
      ? t.union(messageCodecs).is(action.payload.message)
      : messageCodecs.is(action.payload.message));
}
