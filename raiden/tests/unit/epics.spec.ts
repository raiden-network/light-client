import { merge, of, from, timer } from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray } from 'rxjs/operators';
import { marbles } from 'rxjs-marbles/jest';
import { range } from 'lodash';

import { AddressZero, Zero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { ContractTransaction } from 'ethers/contract';

import { RaidenState, initialState } from 'raiden/store/state';
import { raidenReducer } from 'raiden/store/reducers';
import {
  RaidenActions,
  RaidenActionType,
  raidenInit,
  raidenShutdown,
  ShutdownReason,
  newBlock,
  tokenMonitored,
  channelMonitored,
  channelOpen,
  channelOpened,
  channelDeposit,
  channelDeposited,
  channelClose,
  channelClosed,
  channelSettleable,
  channelSettle,
} from 'raiden/store/actions';

import { raidenEpics } from 'raiden/store/epics';
import { initMonitorProviderEpic } from 'raiden/store/epics/init';
import { stateOutputEpic, actionOutputEpic } from 'raiden/store/epics/output';
import { newBlockEpic } from 'raiden/store/epics/block';
import { tokenMonitoredEpic, channelMonitoredEpic } from 'raiden/store/epics/monitor';
import {
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
} from 'raiden/store/epics/channel';

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
    const action = newBlock(123); // a random action
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

  describe('raiden initialization & shutdown', () => {
    test(
      'init newBlock, tokenMonitored, channelMonitored events',
      marbles(m => {
        const newState = [
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
          newBlock(128),
          channelClosed(tokenNetwork, partner, channelId, partner, 128, '0xcloseTxHash'),
          newBlock(629),
          channelSettleable(tokenNetwork, partner, 629),
          newBlock(633),
          channelSettle(tokenNetwork, partner), // channel is left in 'settling' state
        ].reduce(raidenReducer, state);
        /* this test requires mocked provider, or else emit is called with setTimeout and doesn't run
         * before the return of the function.
         */
        const action$ = m.cold('---a------d|', {
            a: raidenInit(),
            d: raidenShutdown(ShutdownReason.STOP),
          }),
          state$ = m.cold('--s---|', { s: newState }),
          emitBlock$ = m.cold('----------b-|').pipe(
            tap(() => depsMock.provider.emit('block', 634)),
            ignoreElements(),
          );
        m.expect(merge(emitBlock$, raidenEpics(action$, state$, depsMock))).toBeObservable(
          m.cold('---(tc)---b-|', {
            t: tokenMonitored(token, tokenNetwork, false),
            // ensure channelMonitored is emitted by raidenInit even for 'settling' channel
            c: channelMonitored(tokenNetwork, partner, channelId),
            b: newBlock(634),
          }),
        );
      }),
    );

    test('ShutdownReason.ACCOUNT_CHANGED', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);

      depsMock.provider.listAccounts.mockResolvedValue([]);
      // listAccounts first return array with address, then empty
      depsMock.provider.listAccounts.mockResolvedValueOnce([depsMock.address]);

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(raidenShutdown(ShutdownReason.ACCOUNT_CHANGED));
    });

    test('ShutdownReason.NETWORK_CHANGED', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);

      depsMock.provider.getNetwork.mockResolvedValueOnce({ chainId: 899, name: 'unknown' });

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(raidenShutdown(ShutdownReason.NETWORK_CHANGED));
    });

    test('unexpected exception triggers shutdown', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);

      const error = new Error('connection lost');
      depsMock.provider.listAccounts.mockRejectedValueOnce(error);

      // whole raidenEpics completes upon raidenShutdown, with it as last emitted value
      await expect(raidenEpics(action$, state$, depsMock).toPromise()).resolves.toEqual(
        raidenShutdown(error),
      );
    });
  });

  test(
    'newBlockEpic',
    marbles(m => {
      const closeBlock = 125;
      // state contains one channel in closed state
      const newState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, 121, '0xopenTxHash'),
        channelClosed(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          closeBlock,
          '0xcloseTxHash',
        ),
      ].reduce(raidenReducer, state);
      /* first newBlock bigger than settleTimeout causes a channelSettleable to be emitted */
      const action$ = m.cold('---b-B-|', {
          b: newBlock(closeBlock + settleTimeout - 1),
          B: newBlock(closeBlock + settleTimeout + 4),
        }),
        state$ = m.cold('--s-|', { s: newState });
      m.expect(newBlockEpic(action$, state$)).toBeObservable(
        m.cold('-----S-|', {
          S: channelSettleable(tokenNetwork, partner, closeBlock + settleTimeout + 4),
        }),
      );
    }),
  );

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

      await expect(
        tokenMonitoredEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
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

      await expect(promise).resolves.toMatchObject({
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
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: RaidenActionType.CHANNEL_OPENED,
        tokenNetwork,
        partner,
        id: channelId,
        settleTimeout,
        openBlock: 125,
      });

      // expect tokenNetworkContract.listenerCount to have been checked multiple times
      expect(listenerCountSpy).toHaveBeenCalledTimes(multiple);
      // but only one listener is registered
      expect(listenerCountSpy).toHaveLastReturnedWith(1);

      listenerCountSpy.mockRestore();
    });
  });

  describe('chanelOpenEpic', () => {
    test('fails if channel.state !== opening', async () => {
      // there's a channel already opened in state
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = [
          tokenMonitored(token, tokenNetwork, true),
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, 125, '0xtxHash'),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_OPEN_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('tx fails', async () => {
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = [tokenMonitored(token, tokenNetwork, true), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const tx: ContractTransaction = {
        hash: '0xtxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValueOnce(tx);

      await expect(channelOpenEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_OPEN_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('success', async () => {
      // there's a channel already opened in state
      const action = channelOpen(tokenNetwork, partner, settleTimeout),
        curState = [tokenMonitored(token, tokenNetwork, true), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      const tx: ContractTransaction = {
        hash: '0xtxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.openChannel.mockResolvedValueOnce(tx);

      // result is undefined on success as the respective channelOpenedAction is emitted by the
      // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
      await expect(
        channelOpenEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(tokenNetworkContract.functions.openChannel).toHaveBeenCalledTimes(1);
      expect(tx.wait).toHaveBeenCalledTimes(1);
    });
  });

  describe('channelOpenedEpic', () => {
    test("filter out if channel isn't in 'open' state", async () => {
      // channel.state is 'opening'
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpen(tokenNetwork, partner, settleTimeout),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, 125, '0xtxHash'),
        ),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenedEpic(action$, state$).toPromise()).resolves.toBeUndefined();
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
        curState = [tokenMonitored(token, tokenNetwork, true), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenedEpic(action$, state$).toPromise()).resolves.toMatchObject({
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
      openBlock = 121,
      closeBlock = 124,
      settleBlock = closeBlock + settleTimeout + 1,
      settleAmountsEncoded = defaultAbiCoder.encode(['uint256', 'uint256'], [Zero, Zero]);

    test('first channelMonitored with past$ own ChannelNewDeposit event', async () => {
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(
          channelMonitored(tokenNetwork, partner, channelId, openBlock),
        ),
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

      await expect(
        channelMonitoredEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
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
        curState = [
          tokenMonitored(token, tokenNetwork, true),
          channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
        ].reduce(raidenReducer, state);
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

      await expect(promise).resolves.toMatchObject({
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
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xtxHash'),
      ].reduce(raidenReducer, state);
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
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSITED,
        tokenNetwork,
        partner,
        id: channelId,
        participant: depsMock.address,
        totalDeposit: deposit,
      });

      // expect tokenNetworkContract.listenerCount to have been checked multiple times
      expect(listenerCountSpy).toHaveBeenCalledTimes(multiple);
      // but only one listener is registered
      expect(listenerCountSpy).toHaveLastReturnedWith(1);

      listenerCountSpy.mockRestore();
    });

    test('new$ partner ChannelClosed event', async () => {
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelMonitored(tokenNetwork, partner, channelId)),
        state$ = of<RaidenState>(curState);

      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelClosed(channelId, null, null),
        makeLog({
          blockNumber: closeBlock,
          transactionHash: '0xcloseTxHash',
          filter: tokenNetworkContract.filters.ChannelClosed(channelId, partner, 11),
        }),
      );

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_CLOSED,
        tokenNetwork,
        partner,
        id: channelId,
        participant: partner,
        closeBlock,
        txHash: '0xcloseTxHash',
      });
    });

    test('new$ ChannelSettled event', async () => {
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        channelClosed(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          closeBlock,
          '0xcloseTxHash',
        ), // channel is in "closed" state already
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelMonitored(tokenNetwork, partner, channelId)),
        state$ = of<RaidenState>(curState);

      expect(depsMock.provider.removeListener).not.toHaveBeenCalled();
      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelNewDeposit(channelId, null, null),
        ),
      ).toBe(1);

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelClosed(channelId, null, null),
        ),
      ).toBe(1);

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
        ),
      ).toBe(1);

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
        makeLog({
          blockNumber: settleBlock,
          transactionHash: '0xsettleTxHash',
          filter: tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
          data: settleAmountsEncoded, // participants amounts aren't indexed, so they go in data
        }),
      );

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_SETTLED,
        tokenNetwork,
        partner,
        id: channelId,
        settleBlock,
        txHash: '0xsettleTxHash',
      });

      // ensure ChannelSettledAction completed channel monitoring and unsubscribed from events
      expect(depsMock.provider.removeListener).toHaveBeenCalledWith(
        tokenNetworkContract.filters.ChannelNewDeposit(channelId, null, null),
        expect.anything(),
      );

      expect(depsMock.provider.removeListener).toHaveBeenCalledWith(
        tokenNetworkContract.filters.ChannelClosed(channelId, null, null),
        expect.anything(),
      );

      expect(depsMock.provider.removeListener).toHaveBeenCalledWith(
        tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
        expect.anything(),
      );

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelNewDeposit(channelId, null, null),
        ),
      ).toBe(0);

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelClosed(channelId, null, null),
        ),
      ).toBe(0);

      expect(
        tokenNetworkContract.listenerCount(
          tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
        ),
      ).toBe(0);
    });
  });

  describe('chanelDepositEpic', () => {
    const deposit = bigNumberify(1023),
      openBlock = 121;

    test('fails if there is no token for tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(state);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('fails if channel.state !== "open"', async () => {
      // there's a channel already opened in state
      const action = channelDeposit(tokenNetwork, partner, deposit),
        // channel is in 'opening' state
        curState = [
          tokenMonitored(token, tokenNetwork, true),
          channelOpen(tokenNetwork, partner, settleTimeout),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(action),
        state$ = of<RaidenState>(curState);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('approve tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenContract.functions.approve.mockResolvedValueOnce(approveTx);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('setTotalDeposit tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
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
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.setTotalDeposit.mockResolvedValueOnce(setTotalDeposiTx);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('success', async () => {
      // there's a channel already opened in state
      let curState = [
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
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelDeposit(tokenNetwork, partner, deposit)),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: '0xapproveTxHash',
        confirmations: 1,
        nonce: 1,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
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
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.setTotalDeposit.mockResolvedValueOnce(setTotalDepositTx);

      // result is undefined on success as the respective channelDepositedAction is emitted by the
      // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toBeUndefined();
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

  describe('chanelCloseEpic', () => {
    const openBlock = 121;

    test('fails if there is no open channel with partner on tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenActions>(channelClose(tokenNetwork, partner)),
        state$ = of<RaidenState>(state);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        {
          type: RaidenActionType.CHANNEL_CLOSE_FAILED,
          tokenNetwork,
          partner,
          error: expect.any(Error),
        },
      );
    });

    test('fails if channel.state !== "open"|"closing"', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        // channel is in 'opening' state
        channelOpen(tokenNetwork, partner, settleTimeout),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelClose(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        {
          type: RaidenActionType.CHANNEL_CLOSE_FAILED,
          tokenNetwork,
          partner,
          error: expect.any(Error),
        },
      );
    });

    test('closeChannel tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelClose(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      const closeTx: ContractTransaction = {
        hash: '0xcloseTxHash',
        confirmations: 1,
        nonce: 2,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.closeChannel.mockResolvedValueOnce(closeTx);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        {
          type: RaidenActionType.CHANNEL_CLOSE_FAILED,
          tokenNetwork,
          partner,
          error: expect.any(Error),
        },
      );
    });

    test('success', async () => {
      // there's a channel already opened in state
      let curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelClose(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      const closeTx: ContractTransaction = {
        hash: '0xcloseTxHash',
        confirmations: 1,
        nonce: 3,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.closeChannel.mockResolvedValueOnce(closeTx);

      // result is undefined on success as the respective channelClosedAction is emitted by the
      // channelMonitoredEpic, which monitors the blockchain for channel events
      await expect(
        channelCloseEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledTimes(1);
      expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledWith(
        channelId,
        partner,
        expect.anything(), // balance_hash
        expect.anything(), // nonce
        expect.anything(), // additional_hash
        expect.anything(), // signature
      );
      expect(closeTx.wait).toHaveBeenCalledTimes(1);
    });
  });

  describe('chanelSettleEpic', () => {
    const openBlock = 121,
      closeBlock = 125,
      settleBlock = closeBlock + settleTimeout + 1;

    test('fails if there is no channel with partner on tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenActions>(channelSettle(tokenNetwork, partner)),
        state$ = of<RaidenState>(state);

      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_SETTLE_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('fails if channel.state !== "settleable|settling"', async () => {
      // there's a channel in closed state, but not yet settleable
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        newBlock(closeBlock),
        channelClosed(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          closeBlock,
          '0xcloseTxHash',
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelSettle(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_SETTLE_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('settleChannel tx fails', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        newBlock(closeBlock),
        channelClosed(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          closeBlock,
          '0xcloseTxHash',
        ),
        newBlock(settleBlock),
        channelSettleable(tokenNetwork, partner, settleBlock),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelSettle(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      const settleTx: ContractTransaction = {
        hash: '0xsettleTxHash',
        confirmations: 1,
        nonce: 2,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 0 }),
      };
      tokenNetworkContract.functions.settleChannel.mockResolvedValueOnce(settleTx);

      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.CHANNEL_SETTLE_FAILED,
        tokenNetwork,
        partner,
        error: expect.any(Error),
      });
    });

    test('success', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored(token, tokenNetwork, true),
        channelOpened(tokenNetwork, partner, channelId, settleTimeout, openBlock, '0xopenTxHash'),
        newBlock(closeBlock),
        channelClosed(
          tokenNetwork,
          partner,
          channelId,
          depsMock.address,
          closeBlock,
          '0xcloseTxHash',
        ),
        newBlock(settleBlock),
        channelSettleable(tokenNetwork, partner, settleBlock),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenActions>(channelSettle(tokenNetwork, partner)),
        state$ = of<RaidenState>(curState);

      const settleTx: ContractTransaction = {
        hash: '0xsettleTxHash',
        confirmations: 1,
        nonce: 2,
        gasLimit: bigNumberify(1e6),
        gasPrice: bigNumberify(2e10),
        value: Zero,
        data: '0x',
        chainId: depsMock.network.chainId,
        from: depsMock.address,
        wait: jest.fn().mockResolvedValue({ byzantium: true, status: 1 }),
      };
      tokenNetworkContract.functions.settleChannel.mockResolvedValueOnce(settleTx);

      // result is undefined on success as the respective ChannelSettledAction is emitted by the
      // channelMonitoredEpic, which monitors the blockchain for channel events
      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(tokenNetworkContract.functions.settleChannel).toHaveBeenCalledTimes(1);
      expect(tokenNetworkContract.functions.settleChannel).toHaveBeenCalledWith(
        channelId,
        depsMock.address,
        expect.anything(), // self transfered amount
        expect.anything(), // self locked amount
        expect.anything(), // self locksroot
        partner,
        expect.anything(), // partner transfered amount
        expect.anything(), // partner locked amount
        expect.anything(), // partner locksroot
      );
      expect(settleTx.wait).toHaveBeenCalledTimes(1);
    });
  });
});
