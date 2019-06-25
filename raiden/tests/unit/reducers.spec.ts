import { cloneDeep, get } from 'lodash';
import { Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';

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
import { Address, Hash } from 'raiden/utils/types';

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

    test('participant unknown', () => {
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: '0xunknown' as Address,
            totalDeposit: bigNumberify(24),
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
});
