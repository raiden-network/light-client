import { merge, of, from, timer } from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray } from 'rxjs/operators';
import { marbles } from 'rxjs-marbles/jest';

import { AddressZero } from 'ethers/constants';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';

import { RaidenState, ChannelState, initialState } from 'raiden/store/state';
import { bigNumberify } from 'raiden/store/types';
import { raidenReducer } from 'raiden/store/reducers';
import {
  RaidenActions,
  RaidenActionType,
  tokenMonitor,
  tokenMonitored,
  raidenInit,
  channelMonitored,
  newBlock,
} from 'raiden/store/actions';
import {
  stateOutputEpic,
  actionOutputEpic,
  raidenInitializationEpic,
  tokenMonitorEpic,
  tokenMonitoredEpic,
} from 'raiden/store/epics';

import { raidenEpicDeps, makeLog } from './mocks';

describe('raidenEpics', () => {
  // mocks for all RaidenEpicDeps properties
  const depsMock = raidenEpicDeps();
  const state: RaidenState = {
    ...initialState,
    address: depsMock.address,
    blockNumber: 125,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('stateOutputEpic', async () => {
    const outputPromise = depsMock.stateOutput$.toPromise();
    const epicPromise = stateOutputEpic(
      of<RaidenActions>(),
      of<RaidenState>(state),
      depsMock,
    ).toPromise();

    // stateOutputEpic is an state sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // stateOutput$ completes (because state$ completed) and last value was our last emitted state
    await expect(outputPromise).resolves.toMatchObject({ blockNumber: state.blockNumber });
  });

  test('actionOutputEpic', async () => {
    const action = tokenMonitor('0xtoken'); // a random action
    const outputPromise = depsMock.actionOutput$.toPromise();
    const epicPromise = actionOutputEpic(
      of<RaidenActions>(action),
      of<RaidenState>(state),
      depsMock,
    ).toPromise();

    // actionOutputEpic is an action sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // actionOutput$ completes (because action$ completed) and last value was our random action
    await expect(outputPromise).resolves.toBe(action);
  });

  test(
    'raidenInitializationEpic',
    marbles(m => {
      const curState: RaidenState = {
        ...state,
        tokenNetworks: {
          '0xtokenNetwork': {
            '0xpartner': {
              state: ChannelState.open,
              totalDeposit: bigNumberify(200),
              partnerDeposit: bigNumberify(210),
              id: 17,
              settleTimeout: 500,
              openBlock: 121,
            },
          },
        },
        token2tokenNetwork: { '0xtoken': '0xtokenNetwork' },
      };
      /* this test requires mocked provider, or else emit is called with setTimeout and doesn't run
       * before the return of the function.
       */
      const action$ = m.cold('---a--|', { a: raidenInit() }),
        state$ = m.cold('--s---|', { s: curState }),
        emitBlock$ = m.cold('----------b--|').pipe(
          tap(() => depsMock.provider.emit('block', 127)),
          ignoreElements(),
        );
      m.expect(
        merge(emitBlock$, raidenInitializationEpic(action$, state$, depsMock)),
      ).toBeObservable(
        m.cold('---(tc)---b-', {
          t: tokenMonitored('0xtoken', '0xtokenNetwork', false),
          c: channelMonitored('0xtokenNetwork', '0xpartner', 17),
          b: newBlock(127),
        }),
      );
    }),
  );

  describe('tokenMonitorEpic', () => {
    test('succeeds first', async () => {
      const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
        state$ = of<RaidenState>(state);

      // toPromise will ensure observable completes and resolve to last emitted value
      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', true));
    });

    test('succeeds already monitored', async () => {
      const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
        state$ = of<RaidenState>(
          raidenReducer(state, tokenMonitored('0xtoken', '0xtokenNetwork', true)),
        );

      // toPromise will ensure observable completes and resolve to last emitted value
      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toEqual(tokenMonitored('0xtoken', '0xtokenNetwork', false));
    });

    test('fails', async () => {
      const action$ = of<RaidenActions>(tokenMonitor('0xtoken')),
        state$ = of<RaidenState>(state);
      depsMock.registryContract.functions.token_to_token_networks.mockResolvedValueOnce(
        AddressZero,
      );

      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toMatchObject({
        type: RaidenActionType.TOKEN_MONITOR_FAILED,
        token: '0xtoken',
      });
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('tokenMonitoredEpic', () => {
    const token = '0x0000000000000000000000000000000000000001',
      tokenNetwork = '0x0000000000000000000000000000000000000002';
    const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [500]);
    const tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork);

    test('first tokenMonitored with past$ ChannelOpened event', async () => {
      const action = tokenMonitored(token, tokenNetwork, true),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const partner = '0x0000000000000000000000000000000000000018';
      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 121,
          filter: tokenNetworkContract.filters.ChannelOpened(17, depsMock.address, partner, null),
          data: settleTimeoutEncoded, // non-indexed settleTimeout = 500 goes in data
        }),
      ]);

      const result = await tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_OPENED,
        tokenNetwork,
        partner,
        id: 17,
        settleTimeout: 500,
        openBlock: 121,
      });
    });

    test('already tokenMonitored with new$ ChannelOpened event', async () => {
      const action = tokenMonitored(token, tokenNetwork, false),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const partner = '0x0000000000000000000000000000000000000018';

      const promise = tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelOpened(null, depsMock.address, null, null),
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelOpened(17, depsMock.address, partner, null),
          data: settleTimeoutEncoded, // non-indexed settleTimeout = 500 goes in data
        }),
      );

      const result = await promise;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_OPENED,
        tokenNetwork,
        partner,
        id: 17,
        settleTimeout: 500,
        openBlock: 125,
      });
    });

    test("ensure multiple tokenMonitored don't produce duplicated events", async () => {
      const multiple = 16;
      const action = tokenMonitored(token, tokenNetwork, false),
        curState = raidenReducer(state, action);
      const action$ = from(
          [...Array(multiple).keys()].map(() => tokenMonitored(token, tokenNetwork, false)),
        ),
        state$ = of<RaidenState>(curState);

      const partner = '0x0000000000000000000000000000000000000018';
      const listenerCountSpy = jest.spyOn(tokenNetworkContract, 'listenerCount');

      const promise = tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(
          // wait a little and then complete observable, so it doesn't keep listening forever
          takeUntil(timer(100)),
          toArray(), // aggregate all emitted values in this period in a single array
        )
        .toPromise();

      // even though multiple tokenMonitored events were fired, blockchain fires a single event
      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelOpened(null, depsMock.address, null, null),
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelOpened(17, depsMock.address, partner, null),
          data: settleTimeoutEncoded, // non-indexed settleTimeout = 500 goes in data
        }),
      );

      const result = await promise;
      // expect tokenNetworkContract.listenerCount to have been checked multiple times
      expect(listenerCountSpy).toHaveBeenCalledTimes(multiple);
      // but only one listener is registered
      expect(listenerCountSpy.mock.results[listenerCountSpy.mock.calls.length - 1]).toMatchObject({
        type: 'return',
        value: 1,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: RaidenActionType.CHANNEL_OPENED,
        tokenNetwork,
        partner,
        id: 17,
        settleTimeout: 500,
        openBlock: 125,
      });

      listenerCountSpy.mockRestore();
    });
  });
});
