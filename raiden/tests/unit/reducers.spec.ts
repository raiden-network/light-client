import { cloneDeep, get } from 'lodash';
import { Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';

import { RaidenState, initialState, raidenReducer, ChannelState } from 'raiden/store';
import {
  newBlock,
  raidenInit,
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
  matrixSetup,
  matrixRoom,
  matrixRoomLeave,
} from 'raiden/store/actions';

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
    const newState = raidenReducer(state, newBlock({ blockNumber: state.blockNumber + 1 }));
    expect(newState).toMatchObject({ blockNumber: state.blockNumber + 1 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenInit());
    expect(newState).toBe(state);
  });

  describe('tokenMonitored', () => {
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, first: true }));
      expect(newState).toMatchObject({ token2tokenNetwork: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state.token2tokenNetwork[token] = tokenNetwork;
      const newState = raidenReducer(state, tokenMonitored({ token, tokenNetwork, first: true }));
      expect(newState).toBe(state);
    });
  });

  describe('channelOpen', () => {
    const txHash = '0xtxhash';

    test('new channelOpen', () => {
      const newState = raidenReducer(
        state,
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
      );
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
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
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
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        channelOpenFailed(error, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.tokenNetworks[tokenNetwork][partner]).toBeUndefined();
    });
  });

  describe('channelDeposited', () => {
    beforeEach(() => {
      state = raidenReducer(
        state,
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state.tokenNetworks[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: state.address,
            totalDeposit: bigNumberify(23),
            txHash: '0xdeposittxhash',
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toBe(state);
    });

    test('participant unknown', () => {
      const newState = raidenReducer(
        state,
        channelDeposited(
          {
            id: channelId,
            participant: '0xunknown',
            totalDeposit: bigNumberify(24),
            txHash: '0xdeposittxhash',
          },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toBe(state);
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
            txHash: '0xdepositTxHash',
          },
          { tokenNetwork, partner },
        ),
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
        channelDeposited(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash: '0xdeposittxhash',
          },
          { tokenNetwork, partner },
        ),
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
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
      );
    });

    test('channel not in open state', () => {
      state.tokenNetworks[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(state, channelClose(undefined, { tokenNetwork, partner }));
      expect(newState).toBe(state);
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClose(undefined, { tokenNetwork, partner: token }),
      );
      expect(newState).toBe(state);
    });

    test('channelClose puts channel in closing state', () => {
      const newState = raidenReducer(state, channelClose(undefined, { tokenNetwork, partner }));
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
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
      );
    });

    test('unknown channel', () => {
      const newState = raidenReducer(
        state,
        channelClosed(
          { id: channelId + 1, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
      );
      expect(newState).toBe(state);
    });

    test('channelClosed puts channel in closed state', () => {
      const newState = raidenReducer(
        state,
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
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
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
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
      expect(newState).toBe(state);
    });

    test("channelCloseFailed doesn't mutate state", () => {
      const newState = raidenReducer(
        state,
        channelCloseFailed(new Error('channelClose failed'), { tokenNetwork, partner }),
      );
      expect(newState).toBe(state);
    });
  });

  describe('channelSettleable', () => {
    beforeEach(() => {
      // channel in "open" state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner: token }),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel not in "closed" state', () => {
      state = [newBlock({ blockNumber: settleBlock })].reduce(raidenReducer, state);
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel.state becomes "settleable" `settleTimeout` blocks after closeBlock', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
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
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
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
      expect(newState).toBe(state);
    });

    test('channel not in "settleable" state', () => {
      // still in "closed" state
      const newState = [channelSettle(undefined, { tokenNetwork, partner })].reduce(
        raidenReducer,
        state,
      );
      expect(newState).toBe(state);
    });

    test('channel.state becomes "settling" after "channelSettle"', () => {
      const newState = [
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        channelSettle(undefined, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      expect(newState.tokenNetworks).toMatchObject({
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
      expect(newState2).toBe(newState);
    });
  });

  describe('channelSettled', () => {
    beforeEach(() => {
      // channel starts in "opened" state
      state = [
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash: '0xopenTxHash' },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
    });

    test('unknown channel', () => {
      state = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
      ].reduce(raidenReducer, state);
      const newState = [
        // no channel with partner=token
        channelSettled(
          { id: channelId, settleBlock, txHash: '0xsettleTxHash' },
          { tokenNetwork, partner: token },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('channel not in "closed|settleable|settling" state', () => {
      // still in "opened" state
      const newState = [
        channelSettled(
          { id: channelId, settleBlock, txHash: '0xsettleTxHash' },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(newState).toBe(state);
    });

    test('success: "closed" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettled(
          { id: channelId, settleBlock, txHash: '0xsettleTxHash' },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(get(newState.tokenNetworks, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settleable" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettled(
          { id: channelId, settleBlock: settleBlock + 1, txHash: '0xsettleTxHash' },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      expect(get(newState.tokenNetworks, [tokenNetwork, partner])).toBeUndefined();
    });

    test('success: "settling" => gone', () => {
      const newState = [
        channelClosed(
          { id: channelId, participant: address, closeBlock, txHash: '0xcloseTxHash' },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
        newBlock({ blockNumber: settleBlock + 1 }),
        channelSettle(undefined, { tokenNetwork, partner }), // state=settling
        newBlock({ blockNumber: settleBlock + 2 }),
        channelSettled(
          { id: channelId, settleBlock: settleBlock + 2, txHash: '0xsettleTxHash' },
          { tokenNetwork, partner },
        ),
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
      const newState = [matrixSetup({ server, setup })].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'server'])).toBe(server);
      expect(get(newState, ['transport', 'matrix', 'setup'])).toBe(setup);
    });

    test('matrixRoom', () => {
      const roomId = '!roomId:matrix.raiden.test',
        newRoomId = '!newRoomId:matrix.raiden.test';

      let newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state);
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([roomId]);

      // new room goes to the front
      newState = [matrixRoom({ roomId: newRoomId }, { address: partner })].reduce(
        raidenReducer,
        newState,
      );
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([
        newRoomId,
        roomId,
      ]);

      // old room is brought back to the front
      newState = [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, newState);
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toEqual([
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
      expect(get(newState, ['transport', 'matrix', 'address2rooms', partner])).toBeUndefined();
    });
  });
});
