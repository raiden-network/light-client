import { merge, of, from, timer } from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray } from 'rxjs/operators';
import { marbles } from 'rxjs-marbles/jest';
import { range } from 'lodash';

import { AddressZero } from 'ethers/constants';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { ContractTransaction, ContractReceipt } from 'ethers/contract';

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
  channelOpen,
  channelOpened,
  newBlock,
} from 'raiden/store/actions';
import {
  stateOutputEpic,
  actionOutputEpic,
  raidenInitializationEpic,
  tokenMonitorEpic,
  tokenMonitoredEpic,
  channelOpenEpic,
  channelOpenedEpic,
  channelMonitoredEpic,
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
  const token = '0x0000000000000000000000000000000000010001',
    tokenNetwork = '0x0000000000000000000000000000000000020001',
    partner = '0x0000000000000000000000000000000000000020';
  depsMock.registryContract.functions.token_to_token_networks.mockImplementation(async _token =>
    _token === token ? tokenNetwork : AddressZero,
  );
  const tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork);
  const settleTimeout = 500,
    channelId = 17;

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
    const action = tokenMonitor(token); // a random action
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
          [tokenNetwork]: {
            [partner]: {
              state: ChannelState.open,
              totalDeposit: bigNumberify(200),
              partnerDeposit: bigNumberify(210),
              id: channelId,
              settleTimeout,
              openBlock: 121,
            },
          },
        },
        token2tokenNetwork: { [token]: tokenNetwork },
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
          t: tokenMonitored(token, tokenNetwork, false),
          c: channelMonitored(tokenNetwork, partner, channelId),
          b: newBlock(127),
        }),
      );
    }),
  );

  describe('tokenMonitorEpic', () => {
    test('succeeds first', async () => {
      const action$ = of<RaidenActions>(tokenMonitor(token)),
        state$ = of<RaidenState>(state);

      // toPromise will ensure observable completes and resolve to last emitted value
      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toEqual(tokenMonitored(token, tokenNetwork, true));
    });

    test('succeeds already monitored', async () => {
      const action$ = of<RaidenActions>(tokenMonitor(token)),
        state$ = of<RaidenState>(raidenReducer(state, tokenMonitored(token, tokenNetwork, true)));

      // toPromise will ensure observable completes and resolve to last emitted value
      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toEqual(tokenMonitored(token, tokenNetwork, false));
    });

    test('fails', async () => {
      const action$ = of<RaidenActions>(tokenMonitor(token)),
        state$ = of<RaidenState>(state);
      depsMock.registryContract.functions.token_to_token_networks.mockResolvedValueOnce(
        AddressZero,
      );

      const result = await tokenMonitorEpic(action$, state$, depsMock).toPromise();
      expect(result).toMatchObject({
        type: RaidenActionType.TOKEN_MONITOR_FAILED,
        token,
      });
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('tokenMonitoredEpic', () => {
    const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [settleTimeout]);

    test('first tokenMonitored with past$ ChannelOpened event', async () => {
      const action = tokenMonitored(token, tokenNetwork, true),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 121,
          filter: tokenNetworkContract.filters.ChannelOpened(
            channelId,
            depsMock.address,
            partner,
            null,
          ),
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
        id: channelId,
        settleTimeout,
        openBlock: 121,
      });
    });

    test('already tokenMonitored with new$ ChannelOpened event', async () => {
      const action = tokenMonitored(token, tokenNetwork, false),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const promise = tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelOpened(null, depsMock.address, null, null),
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelOpened(
            channelId,
            depsMock.address,
            partner,
            null,
          ),
          data: settleTimeoutEncoded, // non-indexed settleTimeout = 500 goes in data
        }),
      );

      const result = await promise;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_OPENED,
        tokenNetwork,
        partner,
        id: channelId,
        settleTimeout,
        openBlock: 125,
      });
    });

    test("ensure multiple tokenMonitored don't produce duplicated events", async () => {
      const multiple = 16;
      const action = tokenMonitored(token, tokenNetwork, false),
        curState = raidenReducer(state, action);
      const action$ = from(range(multiple).map(() => tokenMonitored(token, tokenNetwork, false))),
        state$ = of<RaidenState>(curState);

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
          filter: tokenNetworkContract.filters.ChannelOpened(
            channelId,
            depsMock.address,
            partner,
            null,
          ),
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
        id: channelId,
        settleTimeout,
        openBlock: 125,
      });

      listenerCountSpy.mockRestore();
    });
  });

  describe('chanelOpenEpic', () => {
    test('fails if channel.state !== opening', async () => {
      // there's a channel already opened in state
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = raidenReducer(
          state,
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, 125, '0xtxHash'),
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const result = await channelOpenEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_OPEN_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('tx fails', async () => {
      // there's a channel already opened in state
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const receipt: ContractReceipt = { byzantium: true, status: 0 };
      const tx: ContractTransaction = {
        hash: '0xtxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue(receipt),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValue(tx);

      const result = await channelOpenEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_OPEN_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('success', async () => {
      // there's a channel already opened in state
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const receipt: ContractReceipt = { byzantium: true, status: 1 };
      const tx: ContractTransaction = {
        hash: '0xtxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue(receipt),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValue(tx);

      const result = await channelOpenEpic(action$, state$, depsMock).toPromise();

      // result is undefined on success as the respective channelOpenedAction is emitted by the
      // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
      expect(result).toBeUndefined();
      expect(tokenNetworkContract.functions.openChannel).toHaveBeenCalledTimes(1);
      expect(tx.wait).toHaveBeenCalledTimes(1);
    });
  });

  describe('channelOpenedEpic', () => {
    test("filter out if channel isn't in 'open' state", async () => {
      // channel.state is 'opening'
      const curState = raidenReducer(state, channelOpen(tokenNetwork, partner, settleTimeout));
      const action$ = of<RaidenActions>(
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, 125, '0xtxHash'),
        ),
        state$ = of<RaidenState>(curState);

      const result = await channelOpenedEpic(action$, state$).toPromise();
      expect(result).toBeUndefined();
    });

    test('channelOpened triggers channel monitoring', async () => {
      // channel.state is 'opening'
      const action = channelOpened(
          tokenNetwork,
          partner,
          channelId,
          settleTimeout,
          125,
          '0xtxHash',
        ),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const result = await channelOpenedEpic(action$, state$).toPromise();
      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_MONITORED,
        tokenNetwork,
        partner,
        id: channelId,
        fromBlock: 125,
      });
    });
  });

  describe('channelMonitoredEpic', () => {
    const deposit = bigNumberify(1023),
      depositEncoded = defaultAbiCoder.encode(['uint256'], [deposit]),
      openBlock = 121;

    test('first channelMonitored with past$ own ChannelNewDeposit event', async () => {
      const action = channelMonitored(tokenNetwork, partner, channelId, openBlock),
        curState = raidenReducer(
          state,
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 123,
          filter: tokenNetworkContract.filters.ChannelNewDeposit(
            channelId,
            depsMock.address,
            null,
          ),
          data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
        }),
      ]);

      const result = await channelMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSITED,
        tokenNetwork,
        partner,
        id: channelId,
        participant: depsMock.address,
        totalDeposit: deposit,
      });
    });

    test('already channelMonitored with new$ partner ChannelNewDeposit event', async () => {
      const action = channelMonitored(tokenNetwork, partner, channelId),
        curState = raidenReducer(
          state,
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelNewDeposit(channelId, null, null),
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelNewDeposit(channelId, partner, null),
          data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
        }),
      );

      const result = await promise;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSITED,
        tokenNetwork,
        partner,
        id: channelId,
        participant: partner,
        totalDeposit: deposit,
      });
    });

    test("ensure multiple channelMonitored don't produce duplicated events", async () => {
      const multiple = 16;
      const curState = raidenReducer(
        state,
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
      );
      const action$ = from(
          range(multiple).map(() => channelMonitored(tokenNetwork, partner, channelId)),
        ),
        state$ = of<RaidenState>(curState);

      const listenerCountSpy = jest.spyOn(tokenNetworkContract, 'listenerCount');

      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(
          // wait a little and then complete observable, so it doesn't keep listening forever
          takeUntil(timer(100)),
          toArray(), // aggregate all emitted values in this period in a single array
        )
        .toPromise();

      // even though multiple channelMonitored events were fired, blockchain fires a single event
      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelNewDeposit(channelId, null, null),
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelNewDeposit(
            channelId,
            depsMock.address,
            null,
          ),
          data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
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
        type: RaidenActionType.CHANNEL_DEPOSITED,
        tokenNetwork,
        partner,
        id: channelId,
        participant: depsMock.address,
        totalDeposit: deposit,
      });

      listenerCountSpy.mockRestore();
    });
  });
});
