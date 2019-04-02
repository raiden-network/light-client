import { merge, of, from, timer } from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray } from 'rxjs/operators';
import { marbles } from 'rxjs-marbles/jest';
import { range } from 'lodash';

import { AddressZero } from 'ethers/constants';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { ContractTransaction } from 'ethers/contract';

import { RaidenState, initialState } from 'raiden/store/state';
import { bigNumberify } from 'raiden/store/types';
import { raidenReducer } from 'raiden/store/reducers';
import {
  RaidenActions,
  RaidenActionType,
  raidenInit,
  raidenShutdown,
  newBlock,
  tokenMonitor,
  tokenMonitored,
  channelMonitored,
  channelOpen,
  channelOpened,
  channelDeposit,
  channelDeposited,
} from 'raiden/store/actions';
import {
  stateOutputEpic,
  actionOutputEpic,
  raidenEpics,
  tokenMonitorEpic,
  tokenMonitoredEpic,
  channelOpenEpic,
  channelOpenedEpic,
  channelMonitoredEpic,
  channelDepositEpic,
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

  function applyActions(actions: RaidenActions[]): RaidenState {
    let newState = state;
    for (const action of actions) {
      newState = raidenReducer(newState, action);
    }
    return newState;
  }

  const token = '0x0000000000000000000000000000000000010001',
    tokenNetwork = '0x0000000000000000000000000000000000020001',
    partner = '0x0000000000000000000000000000000000000020';
  depsMock.registryContract.functions.token_to_token_networks.mockImplementation(async _token =>
    _token === token ? tokenNetwork : AddressZero,
  );
  const tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork),
    tokenContract = depsMock.getTokenContract(token);
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
    'raidenInitializationEpic & raidenShutdown',
    marbles(m => {
      const newState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, 121, '0xopenTxHash'),
        channelDeposited(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          bigNumberify(200),
          '0xownDepositTxHash',
        ),
        channelDeposited(
          tokenNetwork,
          partner,
          channelId,
          partner,
          bigNumberify(200),
          '0xpartnerDepositTxHash',
        ),
      ]);
      /* this test requires mocked provider, or else emit is called with setTimeout and doesn't run
       * before the return of the function.
       */
      const action$ = m.cold('---a------d|', { a: raidenInit(), d: raidenShutdown() }),
        state$ = m.cold('--s---|', { s: newState }),
        emitBlock$ = m.cold('----------b-|').pipe(
          tap(() => depsMock.provider.emit('block', 127)),
          ignoreElements(),
        );
      m.expect(merge(emitBlock$, raidenEpics(action$, state$, depsMock))).toBeObservable(
        m.cold('---(tc)---b-|', {
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
        state$ = of<RaidenState>(applyActions([tokenMonitored(token, tokenNetwork, true)]));

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
        curState = applyActions([action]);
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
        curState = applyActions([action]);
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
        curState = applyActions([action]);
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
      expect(listenerCountSpy).toHaveLastReturnedWith(1);

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
        curState = applyActions([
          tokenMonitored(token, tokenNetwork, true),
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, 125, '0xtxHash'),
        ]);
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
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = applyActions([tokenMonitored(token, tokenNetwork, true), action]);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

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
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValueOnce(tx);

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
        curState = applyActions([tokenMonitored(token, tokenNetwork, true), action]);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

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
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValueOnce(tx);

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
      const curState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpen(tokenNetwork, partner, settleTimeout),
      ]);
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
        curState = applyActions([tokenMonitored(token, tokenNetwork, true), action]);
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
        curState = applyActions([
          tokenMonitored(token, tokenNetwork, true),
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
        ]);
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
        curState = applyActions([
          tokenMonitored(token, tokenNetwork, true),
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
        ]);
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
      const curState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
      ]);
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
      expect(listenerCountSpy).toHaveLastReturnedWith(1);

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

  describe('chanelDepositEpic', () => {
    const deposit = bigNumberify(1023),
      openBlock = 121;

    test('fails if there is no token for tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(state);

      const result = await channelDepositEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('fails if channel.state !== "open"', async () => {
      // there's a channel already opened in state
      const action = channelDeposit(tokenNetwork, partner, deposit),
        // channel is in 'opening' state
        curState = applyActions([
          tokenMonitored(token, tokenNetwork, true),
          channelOpen(tokenNetwork, partner, settleTimeout),
        ]);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const result = await channelDepositEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('approve tx fails', async () => {
      // there's a channel already opened in state
      const curState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ]);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenContract.functions.approve.mockResolvedValueOnce(approveTx);

      const result = await channelDepositEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('setTotalDeposit tx fails', async () => {
      // there's a channel already opened in state
      const curState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ]);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenContract.functions.approve.mockResolvedValueOnce(approveTx);

      const setTotalDeposiTx: ContractTransaction = {
        hash: '0xsetTotaldDepositTxHash',
        confirmations: 1,
        nonce: 2,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.setTotalDeposit.mockResolvedValueOnce(setTotalDeposiTx);

      const result = await channelDepositEpic(action$, state$, depsMock).toPromise();

      expect(result).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
      });
      expect(result.error).toBeInstanceOf(Error);
    });

    test('success', async () => {
      // there's a channel already opened in state
      let curState = applyActions([
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        // own initial deposit of 330
        channelDeposited(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          bigNumberify(330),
          '0xinitialDepositTxHash',
        ),
      ]);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenContract.functions.approve.mockResolvedValueOnce(approveTx);

      const setTotalDepositTx: ContractTransaction = {
        hash: '0xsetTotaldDepositTxHash',
        confirmations: 1,
        nonce: 2,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: bigNumberify(0),
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.setTotalDeposit.mockResolvedValueOnce(setTotalDepositTx);

      const result = await channelDepositEpic(action$, state$, depsMock).toPromise();

      // result is undefined on success as the respective channelDepositedAction is emitted by the
      // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
      expect(result).toBeUndefined();
      expect(tokenContract.functions.approve).toHaveBeenCalledTimes(1);
      expect(approveTx.wait).toHaveBeenCalledTimes(1);
      expect(tokenNetworkContract.functions.setTotalDeposit).toHaveBeenCalledTimes(1);
      expect(tokenNetworkContract.functions.setTotalDeposit).toHaveBeenCalledWith(
        channelId,
        depsMock.address,
        deposit.add(330),
        partner,
        expect.anything(),
      );
      expect(setTotalDepositTx.wait).toHaveBeenCalledTimes(1);
    });
  });
});
