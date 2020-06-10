import { Zero, One, AddressZero } from 'ethers/constants';
import { bigNumberify, keccak256, getNetwork } from 'ethers/utils';

import { raidenReducer } from 'raiden-ts/reducer';
import { RaidenState, makeInitialState } from 'raiden-ts/state';
import { ShutdownReason } from 'raiden-ts/constants';
import { raidenShutdown } from 'raiden-ts/actions';
import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettleable,
  channelSettle,
  channelWithdrawn,
} from 'raiden-ts/channels/actions';
import { matrixSetup, matrixRoom, matrixRoomLeave } from 'raiden-ts/transport/actions';
import { ChannelState, Lock } from 'raiden-ts/channels';
import { Address, Hash, Secret, UInt, Int, Signed } from 'raiden-ts/utils/types';
import {
  transferSecret,
  transferSigned,
  transferProcessed,
  transferUnlock,
  transferClear,
  transferExpire,
  transferSecretReveal,
  transferRefunded,
  transferUnlockProcessed,
  transferExpireProcessed,
  withdrawReceive,
  transferSecretRequest,
  transferSecretRegister,
} from 'raiden-ts/transfers/actions';
import {
  LockedTransfer,
  MessageType,
  Processed,
  Unlock,
  LockExpired,
  SecretReveal,
  RefundTransfer,
  WithdrawConfirmation,
  SecretRequest,
} from 'raiden-ts/messages/types';
import {
  makeMessageId,
  makePaymentId,
  getSecrethash,
  getLocksroot,
} from 'raiden-ts/transfers/utils';
import { RaidenError, ErrorCodes } from 'raiden-ts/utils/error';
import { Direction } from 'raiden-ts/transfers/state';
import { channelKey, channelUniqueKey } from 'raiden-ts/channels/utils';

import { makeSignature } from './mocks';

describe('raidenReducer', () => {
  let state: RaidenState;
  const address = '0x0000000000000000000000000000000000000001' as Address,
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = '0x0000000000000000000000000000000000000020' as Address,
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash,
    channelId = 17,
    fromBlock = 1,
    settleTimeout = 500,
    openBlock = 5123,
    closeBlock = 5999,
    settleBlock = closeBlock + settleTimeout + 1,
    isFirstParticipant = true,
    direction = Direction.SENT;
  const key = channelKey({ tokenNetwork, partner });

  beforeEach(() => {
    state = makeInitialState(
      {
        network: getNetwork('unspecified'),
        address,
        contractsInfo: {
          TokenNetworkRegistry: { address: AddressZero as Address, block_number: 0 },
          ServiceRegistry: { address: AddressZero as Address, block_number: 0 },
          UserDeposit: { address: AddressZero as Address, block_number: 0 },
          SecretRegistry: { address: AddressZero as Address, block_number: 0 },
          MonitoringService: { address: AddressZero as Address, block_number: 0 },
        },
      },
      { blockNumber: 1337 },
    );
  });

  test('newBlock', () => {
    const newState = raidenReducer(state, newBlock({ blockNumber: state.blockNumber + 1 }));
    expect(newState).toMatchObject({ blockNumber: state.blockNumber + 1 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenShutdown({ reason: ShutdownReason.STOP }));
    expect(newState).toEqual(state);
  });

  describe('tokenMonitored', () => {
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, fromBlock }));
      expect(newState).toMatchObject({ tokens: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state = {
        ...state,
        tokens: { [token]: tokenNetwork },
      };
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, fromBlock }));
      expect(newState).toEqual(state);
    });
  });

  describe('channelOpen', () => {
    test('new channelOpen is not persisted', () => {
      const newState = raidenReducer(
        state,
        channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
      );
      expect(newState.channels).toStrictEqual({});
    });

    test('channelOpen.success unconfirmed', () => {
      const newState = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toStrictEqual({});
    });

    test('channelOpen.success confirmed', () => {
      const newState = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { address, deposit: Zero },
          partner: { address: partner, deposit: Zero },
          id: channelId,
          settleTimeout,
          openBlock,
          token,
          tokenNetwork,
        },
      });
    });

    test('channelOpen.failure', () => {
      const error = new RaidenError(ErrorCodes.CNL_OPENCHANNEL_FAILED);
      const newState = [
        channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
        channelOpen.failure(error, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toStrictEqual({});
    });
  });

  describe('channelDeposit success', () => {
    beforeEach(() => {
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: partner, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const newState = [
        channelDeposit.success(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: bigNumberify(23) as UInt<32>,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('own deposit successful', () => {
      const deposit = bigNumberify(25) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelDeposit.success(
          {
            id: channelId,
            participant: address,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit: deposit }, // our total deposit was updated
          partner: { deposit: Zero },
          id: channelId,
        },
      });
    });

    test('partner deposit successful', () => {
      const deposit = bigNumberify(26) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit: Zero },
          partner: { deposit: deposit }, // partner's total deposit was updated
          id: channelId,
        },
      });
    });
  });

  describe('channelWithdrawn', () => {
    const deposit = bigNumberify(500) as UInt<32>;

    beforeEach(() => {
      state = [
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('channel not in open state', () => {
      // put channel in 'closed' state
      const closedState = raidenReducer(
        state,
        channelClose.success(
          {
            id: channelId,
            participant: state.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      // try to apply action/state change
      const newState = raidenReducer(
        closedState,
        channelWithdrawn(
          {
            id: channelId,
            participant: state.address,
            totalWithdraw: bigNumberify(23) as UInt<32>,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      // if channel is not open, action is noop and new state must be the previous one
      expect(newState).toBe(closedState);
    });

    test('own withdraw successful', () => {
      const withdraw = bigNumberify(25) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelWithdrawn(
          {
            id: channelId,
            participant: address,
            totalWithdraw: withdraw,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit, withdraw }, // our totalWithdraw was updated
          partner: { deposit },
          id: channelId,
        },
      });
    });

    test('partner withdraw successful', () => {
      const withdraw = bigNumberify(26) as UInt<32>;
      const newState = raidenReducer(
        state,
        channelWithdrawn(
          {
            id: channelId,
            participant: partner,
            totalWithdraw: withdraw,
            txHash,
            txBlock: openBlock + 2,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: {
          state: ChannelState.open,
          own: { deposit },
          partner: { deposit, withdraw }, // partner's totalWithdraw was updated
          id: channelId,
        },
      });
    });
  });

  describe('channelClose', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: partner, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner }),
      );
      expect(newState).toBe(state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toBe(state);
    });

    test('channelClose.request puts channel in closing state', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner }),
      );
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closing, id: channelId },
      });
    });
  });

  describe('channelClose.success', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.success(
          {
            id: channelId + 1,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toBe(state);
    });

    test('channelClose.success unconfirmed puts channel in closing state, removed noop', () => {
      const newState = [
        channelClose.success(
          {
            id: channelId,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
        channelClose.success(
          {
            id: channelId,
            participant: address,
            txHash,
            txBlock: closeBlock,
            confirmed: false,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closing, id: channelId },
      });
    });

    test('channelClose.success confirmed puts channel in closed state', () => {
      const newState = raidenReducer(
        state,
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      );
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.closed, id: channelId, closeBlock },
      });
    });
  });

  describe('channelClose.failure', () => {
    beforeEach(() => {
      // channel in closing state
      state = [
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelClose.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose.request(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toEqual(state);
    });

    test("channelClose.failure doesn't mutate state", () => {
      const newState = raidenReducer(
        state,
        channelClose.failure(new RaidenError(ErrorCodes.CNL_CLOSECHANNEL_FAILED), {
          tokenNetwork,
          partner,
        }),
      );
      expect(newState).toEqual(state);
    });
  });

  describe('channelSettleable', () => {
    beforeEach(() => {
      // channel in "open" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
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
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.settleable, id: channelId },
      });
    });
  });

  describe('channelSettle.request & channelSettle.failure', () => {
    beforeEach(() => {
      // channel in "closed" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
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
        channelSettle.request(undefined, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "settleable" state', () => {
      // still in "closed" state
      const newState = [channelSettle.request(undefined, { tokenNetwork, partner })].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toEqual(state);
    });

    test('channel.state becomes "settling" after "channelSettle.request"', () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.channels).toMatchObject({
        [key]: { state: ChannelState.settling, id: channelId },
      });
    });

    test("channelSettle.failure doesn't change state", () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle.request(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const error = new RaidenError(ErrorCodes.CNL_SETTLECHANNEL_FAILED);
      const newState2 = raidenReducer(
        newState,
        channelSettle.failure(error, { tokenNetwork, partner }),
      );
      expect(newState2).toEqual(newState);
    });
  });

  describe('channelSettle.success', () => {
    beforeEach(() => {
      // channel starts in "opened" state
      state = [
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: true },
          { tokenNetwork, partner: token },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('channel not in "closed|settleable|settling" state', () => {
      // still in "opened" state
      const newState = [
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toEqual(state);
    });

    test('unconfirmed settle => "settling", removed noop', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: undefined },
          { tokenNetwork, partner },
        ),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: false },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key].state).toBe(ChannelState.settling);
    });

    test('success: "closed" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock,
      });
    });

    test('success: "settleable" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock + 1, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock: settleBlock + 1,
      });
    });

    test('success: "settling" => gone', () => {
      const newState = [
        channelClose.success(
          { id: channelId, participant: address, txHash, txBlock: closeBlock, confirmed: true },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle.request(undefined, { tokenNetwork, partner }), // state=settling
        newBlock({ blockNumber: settleBlock + 2 }),
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock + 2, confirmed: true },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState.channels[key]).toBeUndefined();
      expect(
        newState.oldChannels[channelUniqueKey({ id: channelId, tokenNetwork, partner })],
      ).toMatchObject({
        state: ChannelState.settled,
        id: channelId,
        settleBlock: settleBlock + 2,
      });
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
      expect(newState.transport.server).toBe(server);
      expect(newState.transport.setup).toEqual(setup);
    });

    test('matrixRoom', () => {
      const roomId = '!roomId:matrix.raiden.test',
        newRoomId = '!newRoomId:matrix.raiden.test';

      let newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state);
      expect(newState.transport.rooms?.[partner]).toEqual([roomId]);

      // new room goes to the front
      newState = [matrixRoom({ roomId: newRoomId }, { address: partner })].reduce(
        raidenReducer,
        newState,
      );
      expect(newState.transport.rooms?.[partner]).toEqual([newRoomId, roomId]);

      // old room is brought back to the front
      newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, newState);
      expect(newState.transport.rooms?.[partner]).toEqual([roomId, newRoomId]);
    });

    test('matrixRoomLeave', () => {
      const roomId = '!roomId:matrix.raiden.test';
      const newState = [
        matrixRoom({ roomId }, { address: partner }),
        matrixRoomLeave({ roomId }, { address: partner }),
      ].reduce(raidenReducer, state);
      expect(newState.transport.rooms?.[partner]).toHaveLength(0);
    });
  });

  describe('transfers', () => {
    const secret = keccak256('0xdeadbeef') as Secret,
      secrethash = getSecrethash(secret),
      fee = bigNumberify(3) as Int<32>,
      lock: Lock = {
        amount: bigNumberify(10).add(fee) as UInt<32>,
        expiration: One as UInt<32>,
        secrethash,
      },
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
        locked_amount: lock.amount,
        recipient: partner,
        locksroot: getLocksroot([lock]),
        lock,
        target: partner,
        initiator: address,
        metadata: { routes: [{ route: [partner] }] },
        signature: makeSignature(),
      };

    beforeEach(() => {
      // channel is in open state
      state = raidenReducer(
        state,
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('secret register', () => {
      // normal secret register without blockNumber
      let newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferSecret({ secret }, { secrethash, direction }),
      ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]?.secret).toStrictEqual([
        expect.any(Number),
        { value: secret, registerBlock: 0 },
      ]);

      // with blockNumber saves it as well
      newState = [
        transferSecretRegister.success(
          { secret, txHash, txBlock: 123, confirmed: true },
          { secrethash, direction },
        ),
      ].reduce(raidenReducer, newState);
      expect(newState.sent[secrethash].secret).toStrictEqual([
        expect.any(Number),
        { value: secret, registerBlock: 123 },
      ]);

      // if already registered with blockNumber and try without, keep the blockNumber
      newState = [
        transferSecretRegister.success(
          { secret, txHash, txBlock: 123, confirmed: undefined },
          { secrethash, direction },
        ),
      ].reduce(raidenReducer, newState);
      expect(newState.sent[secrethash].secret).toStrictEqual([
        expect.any(Number),
        { value: secret, registerBlock: 123 },
      ]);
    });

    test('transfer signed', () => {
      // invalid locked
      const message = { ...transfer, nonce: bigNumberify(20) as UInt<8> };
      let newState = [transferSigned({ message, fee, partner }, { secrethash, direction })].reduce(
        raidenReducer,
        state,
      );
      expect(newState.sent).toStrictEqual({});

      message.nonce = transfer.nonce; // fix nonce
      newState = [transferSigned({ message, fee, partner }, { secrethash, direction })].reduce(
        raidenReducer,
        newState,
      );
      expect(newState.sent[secrethash]).toEqual({
        transfer: [expect.any(Number), message],
        fee,
        partner,
      });

      // other transfer with same secretHash doesn't replace the first
      const otherMessageSameSecret = { ...message, payment_identifier: makePaymentId() };
      newState = [
        transferSigned(
          { message: otherMessageSameSecret, fee, partner },
          { secrethash, direction },
        ),
      ].reduce(raidenReducer, newState);
      expect(newState.sent[secrethash]?.transfer?.[1]).toBe(message);
    });

    test('transfer processed', () => {
      const processed: Signed<Processed> = {
        type: MessageType.PROCESSED,
        message_identifier: transfer.message_identifier,
        signature: makeSignature(),
      };
      let newState = [transferProcessed({ message: processed }, { secrethash, direction })].reduce(
        raidenReducer,
        state,
      );

      expect(newState.sent[secrethash]).toBeUndefined();

      newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferProcessed({ message: processed }, { secrethash, direction }),
      ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]?.transferProcessed?.[1]).toBe(processed);
    });

    test('transfer secret request', () => {
      const secretRequest: Signed<SecretRequest> = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          secrethash,
          payment_identifier: transfer.payment_identifier,
          amount: transfer.lock.amount,
          expiration: transfer.lock.expiration,
          signature: makeSignature(),
        },
        action = transferSecretRequest({ message: secretRequest }, { secrethash, direction }),
        newState = [
          transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
          action,
        ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]?.secretRequest?.[1]).toBe(secretRequest);
    });

    test('transfer secret reveal', () => {
      const secretReveal: Signed<SecretReveal> = {
          type: MessageType.SECRET_REVEAL,
          message_identifier: makeMessageId(),
          secret,
          signature: makeSignature(),
        },
        action = transferSecretReveal({ message: secretReveal }, { secrethash, direction }),
        newState = [
          transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
          action,
        ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]?.secretReveal?.[1]).toBe(secretReveal);

      const newState2 = [
        transferSecretReveal({ message: secretReveal }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState2).toBe(newState);
    });

    test('transfer unlocked', () => {
      let unlock: Signed<Unlock> = {
          type: MessageType.UNLOCK,
          chain_id: transfer.chain_id,
          message_identifier: makeMessageId(),
          payment_identifier: transfer.payment_identifier,
          nonce: transfer.nonce.add(2) as UInt<8>, // wrong nonce
          token_network_address: tokenNetwork,
          channel_identifier: transfer.channel_identifier,
          transferred_amount: Zero.add(transfer.lock.amount) as UInt<32>,
          locked_amount: Zero as UInt<32>,
          locksroot: keccak256([]) as Hash,
          secret,
          signature: makeSignature(),
        },
        newState = [
          transferUnlock.success({ message: unlock, partner }, { secrethash, direction }),
        ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]).toBeUndefined();

      newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferUnlock.success({ message: unlock, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      // invalid lock because nonce isn't right
      expect(newState.sent[secrethash]?.unlock).toBeUndefined();

      unlock = { ...unlock, nonce: transfer.nonce.add(1) as UInt<8> };
      newState = [
        transferUnlock.success({ message: unlock, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.unlock?.[1]).toBe(unlock);

      const processed: Signed<Processed> = {
        type: MessageType.PROCESSED,
        message_identifier: unlock.message_identifier,
        signature: makeSignature(),
      };
      newState = [
        transferUnlockProcessed({ message: processed }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.unlockProcessed?.[1]).toBe(processed);
    });

    test('transfer expired', () => {
      let lockExpired: Signed<LockExpired> = {
          type: MessageType.LOCK_EXPIRED,
          chain_id: transfer.chain_id,
          message_identifier: makeMessageId(),
          nonce: transfer.nonce.add(2) as UInt<8>, // invalid nonce
          token_network_address: tokenNetwork,
          channel_identifier: transfer.channel_identifier,
          transferred_amount: Zero as UInt<32>,
          locked_amount: Zero as UInt<32>,
          locksroot: keccak256([]) as Hash,
          secrethash,
          recipient: partner,
          signature: makeSignature(),
        },
        newState = [
          transferExpire.success({ message: lockExpired, partner }, { secrethash, direction }),
        ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]).toBeUndefined();

      newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferExpire.success({ message: lockExpired, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      // invalid lock because nonce isn't right
      expect(newState.sent[secrethash]?.lockExpired).toBeUndefined();

      lockExpired = { ...lockExpired, nonce: transfer.nonce.add(1) as UInt<8> };
      newState = [
        transferExpire.success({ message: lockExpired, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.lockExpired?.[1]).toBe(lockExpired);

      const processed: Signed<Processed> = {
        type: MessageType.PROCESSED,
        message_identifier: lockExpired.message_identifier,
        signature: makeSignature(),
      };
      newState = [
        transferExpireProcessed({ message: processed }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.lockExpiredProcessed?.[1]).toBe(processed);
    });

    test('transfer refunded', () => {
      const refund: Signed<RefundTransfer> = {
        type: MessageType.REFUND_TRANSFER,
        chain_id: transfer.chain_id,
        message_identifier: makeMessageId(),
        payment_identifier: transfer.payment_identifier,
        nonce: One as UInt<8>,
        token_network_address: tokenNetwork,
        token,
        recipient: address,
        target: address,
        initiator: partner,
        channel_identifier: transfer.channel_identifier,
        transferred_amount: Zero as UInt<32>,
        locked_amount: transfer.locked_amount, // "forgot" to decrease locked_amount
        lock: transfer.lock,
        locksroot: transfer.locksroot,
        metadata: { routes: [{ route: [partner] }] },
        signature: makeSignature(),
      };
      let newState = [
        transferRefunded({ message: refund, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash]).toBeUndefined();

      newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferRefunded({ message: refund, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.refund?.[1]).toBe(refund);
    });

    test('transfer channel closed', () => {
      let newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash].transfer[1]).toBe(transfer);
      expect(newState.sent[secrethash].secret).toBeUndefined();

      newState = [
        channelClose.success(
          {
            id: transfer.channel_identifier.toNumber(),
            participant: partner,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, newState);

      expect(newState.sent[secrethash]?.channelClosed?.[1]).toBe(txHash);
    });

    test('transfer cleared', () => {
      let newState = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferSecret({ secret }, { secrethash, direction }),
      ].reduce(raidenReducer, state);

      expect(newState.sent[secrethash].transfer[1]).toBe(transfer);
      expect(newState.sent[secrethash].secret).toStrictEqual([
        expect.any(Number),
        { value: secret, registerBlock: 0 },
      ]);

      newState = [transferClear(undefined, { secrethash, direction })].reduce(
        raidenReducer,
        newState,
      );

      expect(newState.sent[secrethash]).toBeUndefined();
    });

    // withdraw request is under transfer just to use its pending transfer setup/vars
    test('withdrawReceive.success', () => {
      let confirmation: Signed<WithdrawConfirmation> = {
        type: MessageType.WITHDRAW_CONFIRMATION,
        message_identifier: makeMessageId(),
        chain_id: transfer.chain_id,
        token_network_address: tokenNetwork,
        channel_identifier: transfer.channel_identifier,
        participant: partner,
        // withdrawable amount is partner.deposit + own.g
        total_withdraw: transfer.lock.amount,
        nonce: One as UInt<8>,
        expiration: bigNumberify(state.blockNumber + 20) as UInt<32>,
        signature: makeSignature(),
      };

      // no previous balanceProof, next nonce = 1 should work
      const newState = raidenReducer(
        state,
        withdrawReceive.success(
          { message: confirmation },
          {
            tokenNetwork,
            partner,
            totalWithdraw: confirmation.total_withdraw,
            expiration: confirmation.expiration.toNumber(),
          },
        ),
      );
      expect(newState.channels[key].own.nextNonce).toEqual(bigNumberify(2));

      const unlock: Signed<Unlock> = {
        type: MessageType.UNLOCK,
        chain_id: transfer.chain_id,
        message_identifier: makeMessageId(),
        payment_identifier: transfer.payment_identifier,
        nonce: transfer.nonce.add(1) as UInt<8>,
        token_network_address: tokenNetwork,
        channel_identifier: transfer.channel_identifier,
        transferred_amount: Zero.add(transfer.lock.amount) as UInt<32>,
        locked_amount: Zero as UInt<32>,
        locksroot: keccak256([]) as Hash,
        secret,
        signature: makeSignature(),
      };
      // now, a state with a preent own.balanceProof due to a completed transfer
      const newState1 = [
        transferSigned({ message: transfer, fee, partner }, { secrethash, direction }),
        transferUnlock.success({ message: unlock, partner }, { secrethash, direction }),
      ].reduce(raidenReducer, state);
      const prevNonce = newState1.channels[key].own.nextNonce;

      // forgot to update nonce, reducer must be noop
      let newState2 = raidenReducer(
        newState1,
        withdrawReceive.success(
          { message: confirmation },
          {
            tokenNetwork,
            partner,
            totalWithdraw: confirmation.total_withdraw,
            expiration: confirmation.expiration.toNumber(),
          },
        ),
      );
      expect(newState2).toBe(newState1);

      // update nonce
      confirmation = {
        ...confirmation,
        nonce: newState1.channels[key].own.balanceProof.nonce.add(1) as UInt<8>,
      };

      newState2 = raidenReducer(
        newState1,
        withdrawReceive.success(
          { message: confirmation },
          {
            tokenNetwork,
            partner,
            totalWithdraw: confirmation.total_withdraw,
            expiration: confirmation.expiration.toNumber(),
          },
        ),
      );

      // nonce updated
      expect(newState2.channels[key].own.nextNonce).toEqual(prevNonce.add(1));
    });
  });

  describe('pendingTxs', () => {
    const pending = channelDeposit.success(
      {
        id: channelId,
        participant: partner,
        totalDeposit: bigNumberify(12) as UInt<32>,
        txHash,
        txBlock: openBlock + 2,
        confirmed: undefined,
      },
      { tokenNetwork, partner },
    );

    test('pending action added to queue', () => {
      expect(state.pendingTxs).toEqual([]);
      expect(raidenReducer(state, pending).pendingTxs).toEqual([pending]);
    });

    test('confirmed tx cleans pending', () => {
      const pendingState = raidenReducer(state, pending);
      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(pendingState, confirmed).pendingTxs).toEqual([]);
    });

    test("confirmed tx doesn't clean other pending txs on same channel", () => {
      const pending2 = {
        ...pending,
        payload: { ...pending.payload, txHash: keccak256(txHash) as Hash, txBlock: openBlock + 3 },
      };
      const pendingState = [pending, pending2].reduce(raidenReducer, state);
      expect(pendingState.pendingTxs).toEqual([pending, pending2]);

      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(pendingState, confirmed).pendingTxs).toEqual([pending2]);
    });

    test('noop action returns same object', () => {
      // no pending in state for this confirmation == noop
      const confirmed = { ...pending, payload: { ...pending.payload, confirmed: true } };
      expect(raidenReducer(state, confirmed).pendingTxs).toBe(state.pendingTxs);
    });
  });
});
