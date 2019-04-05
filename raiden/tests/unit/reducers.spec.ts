import { cloneDeep } from 'lodash';
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
  newBlock,
  raidenInit,
  tokenMonitored,
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
    closeBlock = 5999;

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
});
