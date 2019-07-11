// import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { Signer } from 'ethers';
import { keccak256, verifyMessage } from 'ethers/utils';
import { concat, hexlify, arrayify } from 'ethers/utils/bytes';
import { HashZero } from 'ethers/constants';

import { Address, Hash, HexString, Signature } from '../utils/types';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { SignedBalanceProof } from '../channels/types';
import { EnvelopeMessage, Message, MessageType, SignedMessageCodecs, Signed } from './types';

const CMDIDs: { readonly [T in MessageType]: number } = {
  [MessageType.DELIVERED]: 12,
  [MessageType.PROCESSED]: 0,
  [MessageType.SECRET_REQUEST]: 3,
  [MessageType.SECRET_REVEAL]: 11,
  [MessageType.LOCKED_TRANSFER]: 7,
  [MessageType.REFUND_TRANSFER]: 8,
  [MessageType.UNLOCK]: 4,
  [MessageType.LOCK_EXPIRED]: 13,
};

/**
 * Create the messageHash for a given EnvelopeMessage
 * @param message EnvelopeMessage to pack
 * @returns Hash of the message pack
 */
export function createMessageHash(message: EnvelopeMessage): Hash {
  switch (message.type) {
    case MessageType.LOCKED_TRANSFER:
    case MessageType.REFUND_TRANSFER:
      // hash of packed representation of the whole message
      return keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3), // pad(3)
          encode(message.nonce, 8),
          encode(message.chain_id, 32),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.lock.expiration, 32),
          encode(message.token_network_address, 20),
          encode(message.token, 20),
          encode(message.channel_identifier, 32),
          encode(message.recipient, 20),
          encode(message.target, 20),
          encode(message.initiator, 20),
          encode(message.locksroot, 32),
          encode(message.lock.secrethash, 32),
          encode(message.transferred_amount, 32),
          encode(message.locked_amount, 32),
          encode(message.lock.amount, 32),
          encode(message.fee, 32),
        ]),
      ) as Hash;
    case MessageType.UNLOCK:
      return keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.chain_id, 32),
          encode(message.message_identifier, 8),
          encode(message.payment_identifier, 8),
          encode(message.token_network_address, 20),
          encode(message.secret, 32),
          encode(message.nonce, 8),
          encode(message.channel_identifier, 32),
          encode(message.transferred_amount, 32),
          encode(message.locked_amount, 32),
          encode(message.locksroot, 32),
        ]),
      ) as Hash;
    case MessageType.LOCK_EXPIRED:
      return keccak256(
        concat([
          encode(CMDIDs[message.type], 1),
          encode(0, 3),
          encode(message.nonce, 8),
          encode(message.chain_id, 32),
          encode(message.message_identifier, 8),
          encode(message.token_network_address, 20),
          encode(message.channel_identifier, 32),
          encode(message.recipient, 20),
          encode(message.locksroot, 32),
          encode(message.secrethash, 32),
          encode(message.transferred_amount, 32),
          encode(message.locked_amount, 32),
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
 * @param message Message to be packed
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
        balanceHash = (message.transferred_amount.isZero() &&
        message.locked_amount.isZero() &&
        message.locksroot === HashZero
          ? HashZero
          : keccak256(
              concat([
                encode(message.transferred_amount, 32),
                encode(message.locked_amount, 32),
                encode(message.locksroot, 32),
              ]),
            )) as Hash;
      return hexlify(
        concat([
          encode(message.token_network_address, 20),
          encode(message.chain_id, 32),
          encode(1, 32), // raiden_contracts.constants.MessageTypeId.BALANCE_PROOF
          encode(message.channel_identifier, 32),
          encode(balanceHash, 32), // balance hash
          encode(message.nonce, 32),
          encode(messageHash, 32), // additional hash
        ]),
      ) as HexString<180>;
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
  }
}

/**
 * Typeguard to check if a message contains a valid signature
 */
export function isSigned<M extends Message & { signature?: Signature }>(
  message: M,
): message is Signed<M> {
  return Signature.is(message.signature);
}

/**
 * Requires a signed message and returns its signer address
 */
export function getMessageSigner(message: Signed<Message>): Address {
  return verifyMessage(arrayify(packMessage(message)), message.signature) as Address;
}

/**
 * Get the SignedBalanceProof associated with an EnvelopeMessage
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
 * Uses lossless-json to encode BigNumbers as JSON 'number' type, as Raiden
 * @param message Message object to be serialized
 * @returns JSON string
 */
export function encodeJsonMessage<M extends Message>(message: Signed<M>): string {
  const codec = SignedMessageCodecs[message.type];
  return losslessStringify(codec.encode(message));
}

/**
 * Try to decode text as a Message, using lossless-json to decode BigNumbers
 * Throws if can't decode, or message is invalid regarding any of the encoded constraints
 * @param text JSON string to try to decode
 * @returns Message object
 */
export function decodeJsonMessage(text: string): Signed<Message> {
  const parsed = losslessParse(text);
  if (!Message.is(parsed)) throw new Error(`Could not find Message "type" in ${text}`);
  const decoded = SignedMessageCodecs[parsed.type].decode(parsed);
  if (decoded.isLeft()) throw ThrowReporter.report(decoded); // throws if decode failed
  return decoded.value;
}

export async function signMessage<M extends Message>(
  signer: Signer,
  message: M,
): Promise<Signed<M>> {
  if (isSigned(message)) return message;
  const signature = (await signer.signMessage(arrayify(packMessage(message)))) as Signature;
  return { ...message, signature };
}
