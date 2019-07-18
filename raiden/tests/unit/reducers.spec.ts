import { cloneDeep, get } from 'lodash';

import { Zero, One, HashZero } from 'ethers/constants';
import { bigNumberify, keccak256 } from 'ethers/utils';

import { raidenReducer } from 'raiden/reducer';
import { RaidenState, initialState } from 'raiden/store';
import { raidenInit } from 'raiden/store/actions';
import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelOpened,
  channelOpenFailed,
  channelDeposited,
  channelClose,
  channelClosed,
  channelCloseFailed,
  channelSettleable,
  channelSettle,
  channelSettleFailed,
  channelSettled,
} from 'raiden/channels/actions';
import { matrixSetup, matrixRoom, matrixRoomLeave } from 'raiden/transport/actions';
import { ChannelState } from 'raiden/channels';
import { Address, Hash, Secret, UInt } from 'raiden/utils/types';
import {
  transferSecret,
  transferSigned,
  transferProcessed,
  transferUnlock,
  transferUnlocked,
  transferred,
} from 'raiden/transfers/actions';
import {
  LockedTransfer,
  MessageType,
  Signed,
  Processed,
  SecretReveal,
  Unlock,
} from 'raiden/messages/types';
import { getBalanceProofFromEnvelopeMessage } from 'raiden/messages/utils';
import { makeMessageId, makePaymentId } from 'raiden/transfers/utils';
import { makeSignature } from './mocks';

describe('raidenReducer', () => {
  let state: RaidenState;
  const address = '0x0000000000000000000000000000000000000001' as Address,
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address,
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash,
    channelId = 17,
    settleTimeout = 500,
    openBlock = 5123,
    closeBlock = 5999,
    settleBlock = closeBlock + settleTimeout + 1;

  beforeEach(() => {
    state = cloneDeep({ ...initialState, address, blockNumber: 1337 });
  });

  test('newBlock', () => {
    const newState = raidenReducer(state, newBlock({ blockNumber: state.blockNumber + 1 }));
    expect(newState).toMatchObject({ blockNumber: state.blockNumber + 1 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenInit());
    expect(newState).toEqual(state);
  });

  describe('tokenMonitored', () => {
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, first: true }));
      expect(newState).toMatchObject({ tokens: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state.tokens[token] = tokenNetwork;
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, first: true }));
      expect(newState).toEqual(state);
    });
  });

  describe('channelOpen', () => {
    test('new channelOpen', () => {
      const newState = raidenReducer(
        state,
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
      );
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.opening,
            own: { deposit: Zero },
            partner: { deposit: Zero },
          },
        },
      });
    });

    test('channelOpened', () => {
      const newState = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: Zero },
            partner: { deposit: Zero },
            id: channelId,
            settleTimeout,
            openBlock,
          },
        },
      });
    });

    test('channelOpenFailed', () => {
      const error = new Error('could not open channel');
      const newState = [
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        channelOpenFailed(error, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels[tokenNetwork][partner]).toBeUndefined();
    });
  });

  describe('channelDeposited', () => {
    beforeEach(() => {
      state = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state.channels[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: bigNumberify(23),
            txHash,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toEqual(state);
    });

    test('own deposit successful', () => {
      const deposit = bigNumberify(25);
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: address,
            totalDeposit: deposit,
            txHash,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: deposit }, // our total deposit was updated
            partner: { deposit: Zero },
            id: channelId,
          },
        },
      });
    });

    test('partner deposit successful', () => {
      const deposit = bigNumberify(26);
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            own: { deposit: Zero },
            partner: { deposit: deposit }, // partner's total deposit was updated
            id: channelId,
          },
        },
      });
    });
  });

  describe('channelClose', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state.channels[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(state, channelClose(undefined, { tokenNetwork, partner }));
      expect(newState).toEqual(state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toEqual(state);
    });

    test('channelClose puts channel in closing state', () => {
      const newState = raidenReducer(state, channelClose(undefined, { tokenNetwork, partner }));
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.closing, id: channelId } },
      });
    });
  });

  describe('channelClosed', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClosed(
          { id: channelId + 1, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toEqual(state);
    });

    test('channelClosed puts channel in closed state', () => {
      const newState = raidenReducer(
        state,
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.closed, id: channelId, closeBlock } },
      });
    });
  });

  describe('channelCloseFailed', () => {
    beforeEach(() => {
      // channel in closing state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        channelClose(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toEqual(state);
    });

    test("channelCloseFailed doesn't mutate state", () => {
      const newState = raidenReducer(
        state,
        channelCloseFailed(new Error('channelClose failed'), { tokenNetwork, partner }),
      );
      expect(newState).toEqual(state);
    });
  });

  describe('channelSettleable', () => {
    beforeEach(() => {
      // channel in "open" state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "closed" state', () => {
      state = [newBlock({ blockNumber: settleBlock })].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel.state becomes "settleable" `settleTimeout` blocks after closeBlock', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.settleable, id: channelId } },
      });
    });
  });

  describe('channelSettle & channelSettleFailed', () => {
    beforeEach(() => {
      // channel in "closed" state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettle(undefined, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "settleable" state', () => {
      // still in "closed" state
      const newState = [channelSettle(undefined, { tokenNetwork, partner })].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toEqual(state);
    });

    test('channel.state becomes "settling" after "channelSettle"', () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.settling, id: channelId } },
      });
    });

    test("channelSettleFailed doesn't change state", () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const error = new Error('settle tx failed');
      const newState2 = raidenReducer(
        newState,
        channelSettleFailed(error, { tokenNetwork, partner }),
      );
      expect(newState2).toEqual(newState);
    });
  });

  describe('channelSettled', () => {
    beforeEach(() => {
      // channel starts in "opened" state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettled({ id: channelId, settleBlock, txHash }, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "closed|settleable|settling" state', () => {
      // still in "opened" state
      const newState = [
        channelSettled({ id: channelId, settleBlock, txHash }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('success: "closed" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettled({ id: channelId, settleBlock, txHash }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(get(newState.channels, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settleable" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettled(
          { id: channelId, settleBlock: settleBlock + 1, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(get(newState.channels, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settling" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle(undefined, { tokenNetwork, partner }), // state=settling
        newBlock({ blockNumber: settleBlock + 2 }),
        channelSettled(
          { id: channelId, settleBlock: settleBlock + 2, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(get(newState.channels, [tokenNetwork, partner])).toBeUndefined();
    });
  });

  describe('matrix', () => {
    test('matrixSetup', () => {
      const server = 'http://matrix.raiden.tld',
        setup = {
          userId: '@0xmyaddress:matrix.raiden.tld',
          accessToken: 'access_token_123',
          deviceId: 'mydevice',
          displayName: '0xuserIdSignature',
        };
      const newState = [matrixSetup({ server, setup })].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'server'])).toBe(server);
      expect(get(newState, ['transport', 'matrix', 'setup'])).toEqual(setup);
    });

    test('matrixRoom', () => {
      const roomId = '!roomId:matrix.raiden.test',
        newRoomId = '!newRoomId:matrix.raiden.test';

      let newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'rooms', partner])).toEqual([roomId]);

      // new room goes to the front
      newState = [matrixRoom({ roomId: newRoomId }, { address: partner })].reduce(
        raidenReducer,
        newState,
      );
      expect(get(newState, ['transport', 'matrix', 'rooms', partner])).toEqual([
        newRoomId,
        roomId,
      ]);

      // old room is brought back to the front
      newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, newState);
      expect(get(newState, ['transport', 'matrix', 'rooms', partner])).toEqual([
        roomId,
        newRoomId,
      ]);
    });

    test('matrixRoomLeave', () => {
      const roomId = '!roomId:matrix.raiden.test';
      const newState = [
        matrixRoom({ roomId }, { address: partner }),
        matrixRoomLeave({ roomId }, { address: partner }),
      ].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'rooms', partner])).toBeUndefined();
    });
  });

  /* eslint-disable @typescript-eslint/camelcase */
  describe('transfers', () => {
    const secret = keccak256('0xdeadbeef') as Secret,
      secrethash = keccak256(secret) as Hash,
      transfer: Signed<LockedTransfer> = {
        type: MessageType.LOCKED_TRANSFER,
        chain_id: bigNumberify(337) as UInt<32>,
        message_identifier: makeMessageId(),
        payment_identifier: makePaymentId(),
        nonce: One as UInt<8>, // nonce not the next
        token_network_address: tokenNetwork,
        token,
        channel_identifier: bigNumberify(1338) as UInt<32>,
        transferred_amount: Zero as UInt<32>,
        locked_amount: bigNumberify(10) as UInt<32>,
        recipient: partner,
        locksroot: '0x0f62facb2351def6af297be573082446fdc8b74a8361fba9376f3b083afd5271' as Hash,
        lock: {
          type: 'Lock',
          amount: bigNumberify(10) as UInt<32>,
          expiration: One as UInt<32>,
          secrethash,
        },
        target: partner,
        initiator: address,
        fee: Zero as UInt<32>,
        signature: makeSignature(),
      };

    beforeEach(() => {
      // channel is in open state
      state = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      );
    });

    test('secret register', () => {
      // normal secret register without blockNumber
      let newState = [transferSecret({ secret }, { secrethash })].reduce(raidenReducer, state);
      expect(get(newState, ['secrets'])).toStrictEqual({ [secrethash]: { secret } });

      // with blockNumber saves it as well
      newState = [transferSecret({ secret, registerBlock: 123 }, { secrethash })].reduce(
        raidenReducer,
        newState,
      );
      expect(get(newState, ['secrets'])).toStrictEqual({
        [secrethash]: {
          secret,
          registerBlock: 123,
        },
      });

      // if already registered with blockNumber and try without, keep the blockNumber
      newState = [transferSecret({ secret }, { secrethash })].reduce(raidenReducer, newState);
      expect(get(newState, ['secrets'])).toStrictEqual({
        [secrethash]: {
          secret,
          registerBlock: 123,
        },
      });
    });

    test('transfer signed', () => {
      let message = { ...transfer, locked_amount: bigNumberify(20) as UInt<32> }; // invalid locked
      let newState = [transferSigned({ message }, { secrethash })].reduce(raidenReducer, state);
      expect(newState.sent).toStrictEqual({});

      message.locked_amount = transfer.locked_amount; // fix locked amount
      newState = [transferSigned({ message }, { secrethash })].reduce(raidenReducer, newState);
      expect(get(newState, ['sent', secrethash])).toStrictEqual({ transfer: message });
      expect(
        Object.values(get(newState, ['channels', tokenNetwork, partner, 'own', 'history'])),
      ).toContainEqual(message);

      // other transfer with same secretHash doesn't replace the first
      const otherMessageSameSecret = { ...message, payment_identifier: makePaymentId() };
      newState = [transferSigned({ message: otherMessageSameSecret }, { secrethash })].reduce(
        raidenReducer,
        newState,
      );
      expect(get(newState, ['sent', secrethash, 'transfer'])).toBe(message);
    });

    test('transfer processed', () => {
      let processed: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: transfer.message_identifier,
          signature: makeSignature(),
        },
        newState = [transferProcessed({ message: processed }, { secrethash })].reduce(
          raidenReducer,
          state,
        );

      expect(get(newState, ['sent', secrethash])).toBeUndefined();

      newState = [
        transferSigned({ message: transfer }, { secrethash }),
        transferProcessed({ message: processed }, { secrethash }),
      ].reduce(raidenReducer, state);

      expect(get(newState, ['sent', secrethash, 'transferProcessed'])).toBe(processed);
    });

    test('secret reveal', () => {
      let reveal: Signed<SecretReveal> = {
          type: MessageType.SECRET_REVEAL,
          secret,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        newState = [transferUnlock({ message: reveal }, { secrethash })].reduce(
          raidenReducer,
          state,
        );

      expect(get(newState, ['sent', secrethash])).toBeUndefined();

      newState = [
        transferSigned({ message: transfer }, { secrethash }),
        transferUnlock({ message: reveal }, { secrethash }),
      ].reduce(raidenReducer, state);

      expect(get(newState, ['sent', secrethash, 'secretReveal'])).toBe(reveal);
    });

    test('transfer unlock', () => {
      let unlock: Signed<Unlock> = {
          type: MessageType.UNLOCK,
          chain_id: transfer.chain_id,
          message_identifier: makeMessageId(),
          payment_identifier: transfer.payment_identifier,
          nonce: transfer.nonce.add(1) as UInt<8>,
          token_network_address: tokenNetwork,
          channel_identifier: transfer.channel_identifier,
          transferred_amount: Zero.add(transfer.lock.amount) as UInt<32>,
          locked_amount: transfer.locked_amount, // "forgot" to decrease locked_amount
          locksroot: HashZero as Hash,
          secret,
          signature: makeSignature(),
        },
        newState = [transferUnlocked({ message: unlock }, { secrethash })].reduce(
          raidenReducer,
          state,
        );

      expect(get(newState, ['sent', secrethash])).toBeUndefined();

      newState = [
        transferSigned({ message: transfer }, { secrethash }),
        transferUnlocked({ message: unlock }, { secrethash }),
      ].reduce(raidenReducer, newState);

      // invalid lock because locked_amount isn't right
      expect(get(newState, ['sent', secrethash, 'unlock'])).toBeUndefined();

      unlock.locked_amount = Zero as UInt<32>;
      newState = [transferUnlocked({ message: unlock }, { secrethash })].reduce(
        raidenReducer,
        newState,
      );

      expect(get(newState, ['sent', secrethash, 'unlock'])).toBe(unlock);
    });

    test('transfer succeeded', () => {
      let unlock: Signed<Unlock> = {
          type: MessageType.UNLOCK,
          chain_id: transfer.chain_id,
          message_identifier: makeMessageId(),
          payment_identifier: transfer.payment_identifier,
          nonce: transfer.nonce.add(1) as UInt<8>,
          token_network_address: tokenNetwork,
          channel_identifier: transfer.channel_identifier,
          transferred_amount: Zero.add(transfer.lock.amount) as UInt<32>,
          locked_amount: Zero as UInt<32>,
          locksroot: HashZero as Hash,
          secret,
          signature: makeSignature(),
        },
        newState = [
          transferSecret({ secret }, { secrethash }),
          transferSigned({ message: transfer }, { secrethash }),
        ].reduce(raidenReducer, state);

      // invalid lock because locked_amount isn't right
      expect(get(newState, ['sent', secrethash, 'transfer'])).toBe(transfer);
      expect(get(newState, ['secrets', secrethash, 'secret'])).toBe(secret);

      newState = [
        transferred({ balanceProof: getBalanceProofFromEnvelopeMessage(unlock) }, { secrethash }),
      ].reduce(raidenReducer, newState);

      expect(get(newState, ['sent', secrethash])).toBeUndefined();
      expect(get(newState, ['secrets', secrethash])).toBeUndefined();
    });
  });
});
