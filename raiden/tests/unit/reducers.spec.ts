import { cloneDeep, get, set } from 'lodash';
import {
  RaidenState,
  initialState,
  raidenReducer,
  ChannelState,
  channelOpen,
  channelOpened,
  channelOpenFailed,
  channelDeposited,
  newBlock,
  raidenInit,
  tokenMonitored,
} from 'raiden/store';
import { bigNumberify } from 'raiden/store/types';

describe('raidenReducer', () => {
  let state: RaidenState;
  const address = '0xmyaddress';

  beforeEach(() => {
    state = cloneDeep({ ...initialState, address, blockNumber: 1337 });
  });

  test('newBlock', () => {
    const newState = raidenReducer(state, newBlock(1338));
    expect(newState).toEqual({ ...state, blockNumber: 1338 });
  });

  test('unhandled state change returns same object', () => {
    const newState = raidenReducer(state, raidenInit());
    expect(newState).toBe(state);
  });

  describe('tokenMonitored', () => {
    const token = '0xtoken',
      tokenNetwork = '0xtokennetwork';
    test('new tokenMonitored', () => {
      const newState = raidenReducer(state, tokenMonitored(token, tokenNetwork, true));
      expect(newState).toEqual({ ...state, token2tokenNetwork: { [token]: tokenNetwork } });
    });

    test('already monitored token', () => {
      state.token2tokenNetwork[token] = tokenNetwork;
      const newState = raidenReducer(state, tokenMonitored(token, tokenNetwork, true));
      expect(newState).toBe(state);
    });
  });

  describe('channelOpen', () => {
    const tokenNetwork = '0xtokennetwork',
      partner = '0xpartner',
      id = 12,
      settleTimeout = 500,
      openBlock = 5123,
      txHash = '0xtxhash';

    test('new channelOpen', () => {
      const newState = raidenReducer(state, channelOpen(tokenNetwork, partner, settleTimeout));
      expect(newState).toEqual({
        ...state,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.opening,
              totalDeposit: bigNumberify(0),
              partnerDeposit: bigNumberify(0),
            },
          },
        },
      });
    });

    test('channelOpened', () => {
      const newState = raidenReducer(
        state,
        channelOpened(tokenNetwork, partner, id, settleTimeout, openBlock, txHash),
      );
      expect(newState).toEqual({
        ...state,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.open,
              totalDeposit: bigNumberify(0),
              partnerDeposit: bigNumberify(0),
              id,
              settleTimeout,
              openBlock,
            },
          },
        },
      });
    });

    test('channelOpenFailed', () => {
      let newState = raidenReducer(state, channelOpen(tokenNetwork, partner, settleTimeout));
      expect(newState).toEqual({
        ...state,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.opening,
              totalDeposit: bigNumberify(0),
              partnerDeposit: bigNumberify(0),
            },
          },
        },
      });
      const error = new Error('could not open channel');
      newState = raidenReducer(state, channelOpenFailed(tokenNetwork, partner, error));
      expect(get(newState, ['tokenNetworks', tokenNetwork, partner])).toBeUndefined();
    });
  });

  describe('channelDeposited', () => {
    const tokenNetwork = '0xtokennetwork',
      partner = '0xpartner',
      id = 12,
      settleTimeout = 500,
      openBlock = 5123;

    beforeEach(() => {
      set(state, ['tokenNetworks', tokenNetwork, partner], {
        state: ChannelState.open,
        totalDeposit: bigNumberify(0),
        partnerDeposit: bigNumberify(0),
        id,
        settleTimeout,
        openBlock,
      });
    });

    test('channel not in open state', () => {
      state.tokenNetworks[tokenNetwork][partner].state = ChannelState.closed;
      const newState = raidenReducer(
        state,
        channelDeposited(
          tokenNetwork,
          partner,
          id,
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
          id,
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
        channelDeposited(tokenNetwork, partner, id, address, deposit, '0xdeposittxhash'),
      );
      expect(newState).toEqual({
        ...state,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.open,
              totalDeposit: deposit, // our total deposit was updated
              partnerDeposit: bigNumberify(0),
              id,
              settleTimeout,
              openBlock,
            },
          },
        },
      });
    });

    test('partner deposit successful', () => {
      const deposit = bigNumberify(26);
      const newState = raidenReducer(
        state,
        channelDeposited(tokenNetwork, partner, id, partner, deposit, '0xdeposittxhash'),
      );
      expect(newState).toEqual({
        ...state,
        tokenNetworks: {
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.open,
              totalDeposit: bigNumberify(0),
              partnerDeposit: deposit, // partner's total deposit was updated
              id,
              settleTimeout,
              openBlock,
            },
          },
        },
      });
    });
  });
});
