import { cloneDeep, get } from 'lodash';
import { Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';

import {
  RaidenState,
  initialState,
  raidenReducer,
  ChannelState,
  channelOpen,
  channelOpened,
  channelOpenFailed,
  channelDeposited,
  channelClose,
  channelClosed,
  channelCloseFailed,
  channelSettleable,
  channelSettle,
  channelSettled,
  channelSettleFailed,
  newBlock,
  raidenInit,
  tokenMonitored,
  matrixSetup,
  matrixRoom,
  matrixRoomLeave,
} from 'raiden/store';

describe('raidenReducer', () => {
  let state: RaidenState;
  const address = '0xmyAddress',
    token = '0xtoken',
    tokenNetwork = '0xtokenNetwork',
    partner = '0xpartner',
    channelId = 17,
    settleTimeout = 500,
    openBlock = 5123,
    closeBlock = 5999,
    settleBlock = closeBlock + settleTimeout + 1;

  beforeEach(() => {
    state = cloneDeep({ ...initialState, address, blockNumber: 1337 });
  });

  test('newBlock', () => {
    const newState = raidenReducer(state, newBlock(state.blockNumber + 1));
    expect(newState).toMatchObject({ blockNumber: state.blockNumber + 1 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenInit());
    expect(newState).toBe(state);
  });

  describe('tokenMonitored', () => {
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored(token, tokenNetwork, true));
      expect(newState).toMatchObject({ token2tokenNetwork: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state.token2tokenNetwork[token] = tokenNetwork;
      const newState = raidenReducer(state, tokenMonitored(token, tokenNetwork, true));
      expect(newState).toBe(state);
    });
  });

  describe('channelOpen', () => {
    const txHash = '0xtxhash';

    test('new channelOpen', () => {
      const newState = raidenReducer(state, channelOpen(tokenNetwork, partner, settleTimeout));
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.opening,
            totalDeposit: Zero,
            partnerDeposit: Zero,
          },
        },
      });
    });

    test('channelOpened', () => {
      const newState = raidenReducer(
        state,
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, txHash),
      );
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            totalDeposit: Zero,
            partnerDeposit: Zero,
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
        channelOpen(tokenNetwork, partner, settleTimeout),
        channelOpenFailed(tokenNetwork, partner, error),
      ].reduce(raidenReducer, state);
      expect(newState.tokenNetworks[tokenNetwork][partner]).toBeUndefined();
    });
  });

  describe('channelDeposited', () => {
    beforeEach(() => {
      state = raidenReducer(
        state,
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      );
    });

    test('channel not in open state', () => {
      state.tokenNetworks[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(
        state,
        channelDeposited(
          tokenNetwork,
          partner,
          channelId,
          state.address,
          bigNumberify(23),
          '0xdeposittxhash',
        ),
      );
      expect(newState).toBe(state);
    });

    test('participant unknown', () => {
      const newState = raidenReducer(
        state,
        channelDeposited(
          tokenNetwork,
          partner,
          channelId,
          '0xunknown',
          bigNumberify(24),
          '0xdeposittxhash',
        ),
      );
      expect(newState).toBe(state);
    });

    test('own deposit successful', () => {
      const deposit = bigNumberify(25);
      const newState = raidenReducer(
        state,
        channelDeposited(tokenNetwork, partner, channelId, address, deposit, '0xdepositTxHash'),
      );
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            totalDeposit: deposit, // our total deposit was updated
            partnerDeposit: Zero,
            id: channelId,
          },
        },
      });
    });

    test('partner deposit successful', () => {
      const deposit = bigNumberify(26);
      const newState = raidenReducer(
        state,
        channelDeposited(tokenNetwork, partner, channelId, partner, deposit, '0xdeposittxhash'),
      );
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: {
          [partner]: {
            state: ChannelState.open,
            totalDeposit: Zero,
            partnerDeposit: deposit, // partner's total deposit was updated
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
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      );
    });

    test('channel not in open state', () => {
      state.tokenNetworks[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(state, channelClose(tokenNetwork, partner));
      expect(newState).toBe(state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(state, channelClose(tokenNetwork, token));
      expect(newState).toBe(state);
    });

    test('channelClose puts channel in closing state', () => {
      const newState = raidenReducer(state, channelClose(tokenNetwork, partner));
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.closing, id: channelId } },
      });
    });
  });

  describe('channelClosed', () => {
    beforeEach(() => {
      // channel in open state
      state = raidenReducer(
        state,
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      );
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClosed(tokenNetwork, partner, channelId + 1, address, closeBlock, '0xcloseTxHash'),
      );
      expect(newState).toBe(state);
    });

    test('channelClosed puts channel in closed state', () => {
      const newState = raidenReducer(
        state,
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
      );
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.closed, id: channelId, closeBlock } },
      });
    });
  });

  describe('channelCloseFailed', () => {
    beforeEach(() => {
      // channel in closing state
      state = [
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        channelClose(tokenNetwork, partner),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(state, channelClose(tokenNetwork, token));
      expect(newState).toBe(state);
    });

    test("channelCloseFailed doesn't mutate state", () => {
      const newState = raidenReducer(
        state,
        channelCloseFailed(tokenNetwork, partner, new Error('channelClose failed')),
      );
      expect(newState).toBe(state);
    });
  });

  describe('channelSettleable', () => {
    beforeEach(() => {
      // channel in "open" state
      state = [
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
      ].reduce(raidenReducer, state);
      const newState = [channelSettleable(tokenNetwork, token, settleBlock)].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toBe(state);
    });

    test('channel not in "closed" state', () => {
      state = [newBlock(settleBlock)].reduce(raidenReducer, state);
      const newState = [channelSettleable(tokenNetwork, token, settleBlock)].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toBe(state);
    });

    test('channel.state becomes "settleable" `settleTimeout` blocks after closeBlock', () => {
      const newState = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
        channelSettleable(tokenNetwork, partner, settleBlock),
      ].reduce(raidenReducer, state);
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.settleable, id: channelId } },
      });
    });
  });

  describe('channelSettle & channelSettleFailed', () => {
    beforeEach(() => {
      // channel in "closed" state
      state = [
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [channelSettleable(tokenNetwork, partner, settleBlock)].reduce(raidenReducer, state);
      const newState = [
        channelSettle(tokenNetwork, token), // no channel with partner=token
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel not in "settleable" state', () => {
      // still in "closed" state
      const newState = [channelSettle(tokenNetwork, partner)].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel.state becomes "settling" after "channelSettle"', () => {
      const newState = [
        channelSettleable(tokenNetwork, partner, settleBlock), // state=settleable
        channelSettle(tokenNetwork, partner),
      ].reduce(raidenReducer, state);
      expect(newState.tokenNetworks).toMatchObject({
        [tokenNetwork]: { [partner]: { state: ChannelState.settling, id: channelId } },
      });
    });

    test("channelSettleFailed doesn't change state", () => {
      const newState = [
        channelSettleable(tokenNetwork, token, settleBlock), // state=settleable
        channelSettle(tokenNetwork, partner),
      ].reduce(raidenReducer, state);
      const error = new Error('settle tx failed');
      const newState2 = raidenReducer(state, channelSettleFailed(tokenNetwork, partner, error));
      expect(newState2).toBe(newState);
    });
  });

  describe('channelSettled', () => {
    beforeEach(() => {
      // channel starts in "opened" state
      state = [
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettled(tokenNetwork, token, channelId, settleBlock, '0xsettleTxHash'),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel not in "closed|settleable|settling" state', () => {
      // still in "opened" state
      const newState = [
        channelSettled(tokenNetwork, partner, channelId, settleBlock, '0xsettleTxHash'),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('success: "closed" => gone', () => {
      const newState = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
        channelSettled(tokenNetwork, partner, channelId, settleBlock, '0xsettleTxHash'),
      ].reduce(raidenReducer, state);
      expect(get(newState.tokenNetworks, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settleable" => gone', () => {
      const newState = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
        channelSettleable(tokenNetwork, token, settleBlock), // state=settleable
        newBlock(settleBlock + 1),
        channelSettled(tokenNetwork, partner, channelId, settleBlock + 1, '0xsettleTxHash'),
      ].reduce(raidenReducer, state);
      expect(get(newState.tokenNetworks, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settling" => gone', () => {
      const newState = [
        channelClosed(tokenNetwork, partner, channelId, address, closeBlock, '0xcloseTxHash'),
        newBlock(settleBlock),
        channelSettleable(tokenNetwork, token, settleBlock),
        newBlock(settleBlock + 1),
        channelSettle(tokenNetwork, token), // state=settling
        newBlock(settleBlock + 2),
        channelSettled(tokenNetwork, partner, channelId, settleBlock + 2, '0xsettleTxHash'),
      ].reduce(raidenReducer, state);
      expect(get(newState.tokenNetworks, [tokenNetwork, partner])).toBeUndefined();
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
      const newState = [matrixSetup(server, setup)].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'server'])).toBe(server);
      expect(get(newState, ['transport', 'matrix', 'setup'])).toBe(setup);
    });

    test('matrixRoom', () => {
      const roomId = '!roomId:matrix.raiden.test',
        newRoomId = '!newRoomId:matrix.raiden.test';

      let newState = [matrixRoom(partner, roomId)].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([roomId]);

      // new room goes to the front
      newState = [matrixRoom(partner, newRoomId)].reduce(raidenReducer, newState);
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([
        newRoomId,
        roomId,
      ]);

      // old room is brought back to the front
      newState = [matrixRoom(partner, roomId)].reduce(raidenReducer, newState);
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([
        roomId,
        newRoomId,
      ]);
    });

    test('matrixRoomLeave', () => {
      const roomId = '!roomId:matrix.raiden.test';
      const newState = [matrixRoom(partner, roomId), matrixRoomLeave(partner, roomId)].reduce(
        raidenReducer,
        state,
      );
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toBeUndefined();
    });
  });
});
