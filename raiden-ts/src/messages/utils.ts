import type { Signer } from '@ethersproject/abstract-signer';
import { arrayify, concat as concatBytes, hexlify } from '@ethersproject/bytes';
import { HashZero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import { encode as rlpEncode } from '@ethersproject/rlp';
import { toUtf8Bytes } from '@ethersproject/strings';
import { verifyMessage } from '@ethersproject/wallet';
import type * as t from 'io-ts';
import { canonicalize } from 'json-canonicalize';
import logging from 'loglevel';

import type { BalanceProof } from '../channels/types';
import { LocksrootZero } from '../constants';
import { assert } from '../utils';
import { encode, jsonParse, jsonStringify } from '../utils/data';
import type { Address, Hash, HexString } from '../utils/types';
import { decode, Signature, Signed } from '../utils/types';
import { messageReceived } from './actions';
import type { AddressMetadata, EnvelopeMessage, Metadata } from './types';
import { Message, MessageType } from './types';

const CMDIDs: { readonly [T in MessageType]: number } = {
  [MessageType.DELIVERED]: 12,
  [MessageType.PROCESSED]: 0,
  [MessageType.SECRET_REQUEST]: 3,
  [MessageType.SECRET_REVEAL]: 11,
  [MessageType.LOCKED_TRANSFER]: 7,
  [MessageType.UNLOCK]: 4,
  [MessageType.LOCK_EXPIRED]: 13,
  [MessageType.WITHDRAW_REQUEST]: 15,
  [MessageType.WITHDRAW_CONFIRMATION]: 16,
  [MessageType.WITHDRAW_EXPIRED]: 17,
  [MessageType.PFS_CAPACITY_UPDATE]: -1,
  [MessageType.PFS_FEE_UPDATE]: -1,
  [MessageType.MONITOR_REQUEST]: -1,
};

// raiden_contracts.constants.MessageTypeId
export enum MessageTypeId {
  BALANCE_PROOF = 1,
  BALANCE_PROOF_UPDATE = 2,
  WITHDRAW = 3,
  COOP_SETTLE = 4,
  IOU = 5,
  MS_REWARD = 6,
}

/**
 * Create the hash of Metadata structure.
 *
 * @param metadata - The LockedTransfer metadata
 * @returns Hash of the metadata.
 */
function createMetadataHash(metadata: Metadata): Hash {
  return keccak256(toUtf8Bytes(canonicalize(metadata))) as Hash;
}

/**
 * Returns a balance_hash from transferred&locked amounts & locksroot
 *
 * @param bp - BalanceProof-like object
 * @param bp.transferredAmount - balanceProof's transferredAmount
 * @param bp.lockedAmount - balanceProof's lockedAmount
 * @param bp.locksroot - balanceProof's locksroot
 * @returns Hash of the balance
 */
export function createBalanceHash({
  transferredAmount,
  lockedAmount,
  locksroot,
}: Pick<BalanceProof, 'transferredAmount' | 'lockedAmount' | 'locksroot'>): Hash {
  let hash = HashZero as Hash;
  if (
    !transferredAmount.isZero() ||
    !lockedAmount.isZero() ||
    (locksroot !== HashZero && locksroot !== LocksrootZero)
  )
    hash = keccak256(
      concatBytes([
        encode(transferredAmount, 32),
        encode(lockedAmount, 32),
        encode(locksroot, 32),
      ]),
    ) as Hash;
  return hash;
}

/**
 * Create the messageHash/additionalHash for a given EnvelopeMessage
 *
 * @param message - EnvelopeMessage to pack
 * @returns Hash of the message pack
 */
export function createMessageHash(message: EnvelopeMessage): Hash {
  let hash: Hash;
  switch (message.type) {
    case MessageType.LOCKED_TRANSFER:
      // hash of packed representation of the whole message
      hash = keccak256(
        concatBytes([
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
          createMetadataHash(message.metadata),
        ]),
      ) as Hash;
      break;
    case MessageType.UNLOCK:
      hash = keccak256(
        concatBytes([
          encode(CMDIDs[message.type], 1),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.secret, 32),
        ]),
      ) as Hash;
      break;
    case MessageType.LOCK_EXPIRED:
      hash = keccak256(
        concatBytes([
          encode(CMDIDs[message.type], 1),
          encode(message.message_identifier, 8),
          encode(message.recipient, 20),
          encode(message.secrethash, 32),
        ]),
      ) as Hash;
      break;
  }
  return hash;
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
        concatBytes([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.delivered_message_identifier, 8),
        ]),
      ) as HexString<12>;
    case MessageType.PROCESSED:
      return hexlify(
        concatBytes([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.message_identifier, 8),
        ]),
      ) as HexString<12>;
    case MessageType.LOCKED_TRANSFER:
    case MessageType.UNLOCK:
    case MessageType.LOCK_EXPIRED: {
      const additionalHash = createMessageHash(message),
        balanceHash = createBalanceHash({
          transferredAmount: message.transferred_amount,
          lockedAmount: message.locked_amount,
          locksroot: message.locksroot,
        });
      return hexlify(
        concatBytes([
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(MessageTypeId.BALANCE_PROOF, 32),
          encode(message.channel_identifier, 32),
          encode(balanceHash, 32), // balance hash
          encode(message.nonce, 32),
          encode(additionalHash, 32),
        ]),
      ) as HexString<212>;
    }
    case MessageType.SECRET_REQUEST:
      return hexlify(
        concatBytes([
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
        concatBytes([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.message_identifier, 8),
          encode(message.secret, 32),
        ]),
      ) as HexString<44>;
    case MessageType.WITHDRAW_REQUEST:
    case MessageType.WITHDRAW_CONFIRMATION:
      return hexlify(
        concatBytes([
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
        concatBytes([
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
        concatBytes([
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
    case MessageType.PFS_FEE_UPDATE:
      return hexlify(
        concatBytes([
          encode(message.canonical_identifier.chain_identifier, 32),
          encode(message.canonical_identifier.token_network_address, 20),
          encode(message.canonical_identifier.channel_identifier, 32),
          encode(message.updating_participant, 20),
          encode(message.fee_schedule.cap_fees, 1),
          encode(message.fee_schedule.flat, 32),
          encode(message.fee_schedule.proportional, 32),
          rlpEncode(message.fee_schedule.imbalance_penalty ?? '0x'),
          encode(message.timestamp, 19),
        ]),
      ) as HexString; // variable size of fee_schedule.imbalance_penalty rlpEncoding, when not null
    case MessageType.MONITOR_REQUEST:
      return hexlify(
        concatBytes([
          encode(message.monitoring_service_contract_address, 20),
          encode(message.balance_proof.chain_id, 32),
          encode(MessageTypeId.MS_REWARD, 32),
          encode(message.balance_proof.token_network_address, 20),
          encode(message.non_closing_participant, 20),
          encode(message.non_closing_signature, 65),
          encode(message.reward_amount, 32),
        ]),
      ) as HexString<221>;
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
 * Get the signed BalanceProof associated with an EnvelopeMessage
 *
 * @param message - Signed EnvelopeMessage
 * @returns Signed BalanceProof object for message
 */
export function getBalanceProofFromEnvelopeMessage(
  message: Signed<EnvelopeMessage>,
): Signed<BalanceProof> {
  return {
    chainId: message.chain_id,
    tokenNetworkAddress: message.token_network_address,
    channelId: message.channel_identifier,
    nonce: message.nonce,
    transferredAmount: message.transferred_amount,
    lockedAmount: message.locked_amount,
    locksroot: message.locksroot,
    additionalHash: createMessageHash(message),
    signature: message.signature,
  };
}

/**
 * Encode a Message as a JSON string
 * Uses io-ts codec to encode BigNumbers as JSON 'string' type, as Raiden
 *
 * @param message - Message object to be serialized
 * @returns JSON string
 */
export function encodeJsonMessage(message: Message | Signed<Message>): string {
  if ('signature' in message) return jsonStringify(Signed(Message).encode(message));
  return jsonStringify(Message.encode(message));
}

/**
 * Try to decode text as a Message, using io-ts codec to decode BigNumbers
 * Throws if can't decode, or message is invalid regarding any of the encoded constraints
 *
 * @param text - JSON string to try to decode
 * @returns Message object
 */
export function decodeJsonMessage(text: string): Message | Signed<Message> {
  const parsed = jsonParse(text);
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
 * @param opts - Options
 * @param opts.log - Logger instance
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
export function isMessageReceivedOfType<C extends t.Mixed>(messageCodecs: C | C[]) {
  /**
   * Typeguard function
   *
   * @param action - Some action to guard to be a messageReceved
   * @returns Whether or not action is a messageReceved of given type
   */
  return (action: unknown): action is messageReceivedTyped<t.TypeOf<C>> =>
    messageReceived.is(action) &&
    (Array.isArray(messageCodecs)
      ? messageCodecs.some((c) => c.is(action.payload.message))
      : messageCodecs.is(action.payload.message));
}

/**
 * Validates metadata was signed by address
 *
 * @param metadata - Peer's metadata
 * @param address - Peer's address
 * @param opts - Options
 * @param opts.log - Logger instance
 * @returns Metadata iff it's valid and was signed by address
 */
export function validateAddressMetadata(
  metadata: AddressMetadata | undefined,
  address: Address,
  { log }: { log: logging.Logger } = { log: logging },
): AddressMetadata | undefined {
  if (metadata && verifyMessage(metadata.user_id, metadata.displayname) === address)
    return metadata;
  else if (metadata) log?.warn('Invalid address metadata', { address, metadata });
}
