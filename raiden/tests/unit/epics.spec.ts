/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
import { raidenEpicDeps, makeLog, makeMatrix } from './mocks';

import { AsyncSubject, BehaviorSubject, merge, of, from, timer, EMPTY, Subject } from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray } from 'rxjs/operators';
import { marbles, fakeSchedulers } from 'rxjs-marbles/jest';
import { range } from 'lodash';

import { AddressZero, Zero } from 'ethers/constants';
import { bigNumberify, verifyMessage } from 'ethers/utils';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { ContractTransaction } from 'ethers/contract';

jest.mock('matrix-js-sdk');
import { createClient } from 'matrix-js-sdk';

jest.mock('cross-fetch');
import fetch from 'cross-fetch';

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
  channelSettled,
  matrixRequestMonitorPresence,
  matrixPresenceUpdate,
  matrixRoom,
  messageSend,
  messageReceived,
  matrixSetup,
} from 'raiden/store/actions';

import { raidenEpics } from 'raiden/store/epics';
import { initMonitorProviderEpic, initMatrixEpic } from 'raiden/store/epics/init';
import { stateOutputEpic, actionOutputEpic } from 'raiden/store/epics/output';
import { newBlockEpic } from 'raiden/store/epics/block';
import {
  tokenMonitoredEpic,
  channelMonitoredEpic,
  channelMatrixMonitorPresenceEpic,
} from 'raiden/store/epics/monitor';
import {
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
} from 'raiden/store/epics/channel';
import {
  matrixShutdownEpic,
  matrixMonitorPresenceEpic,
  matrixPresenceUpdateEpic,
  matrixCreateRoomEpic,
  matrixInviteEpic,
  matrixHandleInvitesEpic,
  matrixLeaveExcessRoomsEpic,
  matrixLeaveUnknownRoomsEpic,
  matrixCleanLeftRoomsEpic,
  matrixMessageSendEpic,
  matrixMessageReceivedEpic,
  matrixMessageReceivedUpdateRoomEpic,
  matrixStartEpic,
} from 'raiden/store/epics/matrix';

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

  const matrixServer = 'matrix.raiden.test',
    userId = `@${depsMock.address.toLowerCase()}:${matrixServer}`,
    accessToken = 'access_token',
    deviceId = 'device_id',
    displayName = 'display_name',
    partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`;

  const matrix = makeMatrix(userId, matrixServer);

  (createClient as jest.Mock).mockReturnValue(matrix);

  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    text: jest.fn(async () => `- ${matrixServer}`),
  });

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

    test('matrix stored setup', async () => {
      const action$ = of(raidenInit()),
        state$ = of({
          ...state,
          transport: {
            matrix: {
              server: matrixServer,
              setup: {
                userId,
                accessToken,
                deviceId,
                displayName,
              },
            },
          },
        });
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).resolves.toEqual({
        type: RaidenActionType.MATRIX_SETUP,
        server: matrixServer,
        setup: {
          userId,
          accessToken: expect.any(String),
          deviceId: expect.any(String),
          displayName: expect.any(String),
        },
      });
    });

    test('matrix fetch servers list', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).resolves.toEqual({
        type: RaidenActionType.MATRIX_SETUP,
        server: `https://${matrixServer}`,
        setup: {
          userId,
          accessToken: expect.any(String),
          deviceId: expect.any(String),
          displayName: expect.any(String),
        },
      });
    });

    test('matrix throws if can not fetch servers list', async () => {
      expect.assertions(2);
      const action$ = of(raidenInit()),
        state$ = of(state);
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn(async () => ''),
      });
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).rejects.toThrow(
        'Could not fetch server list',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('matrix throws if can not contact any server from list', async () => {
      expect.assertions(2);
      const action$ = of(raidenInit()),
        state$ = of(state);
      // mock*Once is a stack. this 'fetch' will be for the servers list
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => `- ${matrixServer}`),
      });
      // and this one for matrixRTT. 404 will reject it
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn(async () => ''),
      });
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).rejects.toThrow(
        'Could not contact any matrix servers',
      );
      expect(fetch).toHaveBeenCalledTimes(2);
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
        .pipe(takeUntil(timer(100)))
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

      await expect(promise).resolves.toEqual(
        channelSettled(tokenNetwork, partner, channelId, settleBlock, '0xsettleTxHash'),
      );

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

  describe('channelMatrixMonitorPresenceEpic', () => {
    test('channelMonitored triggers matrixRequestMonitorPresence', async () => {
      const action$ = of<RaidenActions>(channelMonitored(tokenNetwork, partner, channelId));
      const promise = channelMatrixMonitorPresenceEpic(action$).toPromise();
      await expect(promise).resolves.toEqual(matrixRequestMonitorPresence(partner));
    });
  });

  describe('channelDepositEpic', () => {
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

  describe('matrixStartEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('startClient called on MATRIX_SETUP', async () => {
      expect.assertions(4);
      expect(matrix.startClient).not.toHaveBeenCalled();
      await expect(
        matrixStartEpic(
          of(matrixSetup(matrixServer, { userId, accessToken, deviceId, displayName })),
          EMPTY,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();
      expect(matrix.startClient).toHaveBeenCalledTimes(1);
      expect(matrix.startClient).toHaveBeenCalledWith(
        expect.objectContaining({ initialSyncLimit: 0 }),
      );
    });
  });

  describe('matrixShutdownEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('stopClient called on action$ completion', async () => {
      expect.assertions(3);
      expect(matrix.stopClient).not.toHaveBeenCalled();
      await expect(
        matrixShutdownEpic(EMPTY, EMPTY, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(matrix.stopClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixMonitorPresenceEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('fails when users does not have displayName', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: undefined,
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE_FAILED,
        address: partner,
        error: expect.any(Error),
      });
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: `@${token}:${matrixServer}`,
          displayName: 'display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: `@invalidUser:${matrixServer}`, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE_FAILED,
        address: partner,
        error: expect.any(Error),
      });
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'display_name',
          presence: undefined,
          lastPresenceTs: 123,
        },
      ]);
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE_FAILED,
        address: partner,
        error: expect.any(Error),
      });
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE_FAILED,
        address: partner,
        error: expect.any(Error),
      });
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresenceUpdate(partner, partnerUserId, true),
          matrixRequestMonitorPresence(partner),
        ),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_PRESENCE_UPDATE,
        address: partner,
        userId: partnerUserId,
        available: true,
        ts: expect.any(Number),
      });
    });

    test('success with matrix cached user', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);
      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'partner_display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_PRESENCE_UPDATE,
        address: partner,
        userId: partnerUserId,
        available: true,
        ts: expect.any(Number),
      });
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(partner)),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_PRESENCE_UPDATE,
        address: partner,
        userId: partnerUserId,
        available: true,
        ts: expect.any(Number),
      });
    });
  });

  describe('matrixPresenceUpdateEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('success presence update', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(partner),
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
        ),
        state$ = of(state);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_PRESENCE_UPDATE,
        address: partner,
        userId: partnerUserId,
        available: false,
        ts: expect.any(Number),
      });
    });

    test('update without changing availability does not emit', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(partner),
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({ userId, presence: 'unavailable' }));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    test('cached displayName but invalid signature', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(partner),
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({
        userId,
        presence: 'offline',
        displayName: `partner_display_name`,
      }));
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    test('getProfileInfo error', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(partner),
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
        ),
        state$ = of(state);

      matrix.getProfileInfo.mockRejectedValueOnce(new Error('could not get user profile'));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('matrixCreateRoomEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('success: concurrent messages create single room', async () => {
      expect.assertions(2);
      const action$ = of(
          messageSend(partner, 'message1'),
          messageSend(partner, 'message2'),
          messageSend(partner, 'message3'),
          messageSend(partner, 'message4'),
          messageSend(partner, 'message5'),
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
        ),
        state$ = new BehaviorSubject(state);

      const promise = matrixCreateRoomEpic(action$, state$, depsMock)
        .pipe(
          // update state with action, to ensure serial handling knows about already created room
          tap(action => state$.next(raidenReducer(state, action))),
          takeUntil(timer(50)),
        )
        .toPromise();

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_ROOM,
        address: partner,
        roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)),
      });
      // ensure multiple concurrent messages only create a single room
      expect(matrix.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixInviteEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('do not invite if there is no room for user', async () => {
      expect.assertions(2);
      const action$ = of(matrixPresenceUpdate(partner, partnerUserId, true, 123)),
        state$ = of(state);

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', async () => {
      expect.assertions(3);
      const action$ = of(matrixPresenceUpdate(partner, partnerUserId, true, 123)),
        roomId = `!roomId_for_partner:${matrixServer}`,
        state$ = of(raidenReducer(state, matrixRoom(partner, roomId)));

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).toHaveBeenCalledTimes(1);
      expect(matrix.invite).toHaveBeenCalledWith(roomId, partnerUserId);
    });
  });

  describe('matrixHandleInvitesEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('accept & join from previous presence', async () => {
      expect.assertions(3);
      const action$ = of(matrixPresenceUpdate(partner, partnerUserId, true, 123)),
        state$ = of(state),
        roomId = `!roomId_for_partner:${matrixServer}`;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_ROOM,
        address: partner,
        roomId,
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const action$ = new Subject<RaidenActions>(),
        state$ = of(state),
        roomId = `!roomId_for_partner:${matrixServer}`;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      action$.next(matrixPresenceUpdate(partner, partnerUserId, true, 123));

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_ROOM,
        address: partner,
        roomId,
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('do not accept invites from non-monitored peers', async () => {
      expect.assertions(2);
      const action$ = of<RaidenActions>(),
        state$ = of(state),
        roomId = `!roomId_for_partner:${matrixServer}`;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(
          first(),
          takeUntil(timer(100)),
        )
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('matrixLeaveExcessRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('leave rooms behind threshold', async () => {
      expect.assertions(3);
      const roomId = `!backRoomId_for_partner:${matrixServer}`,
        action = matrixRoom(partner, `!frontRoomId_for_partner:${matrixServer}`),
        action$ = of(action),
        state$ = of(
          [
            matrixRoom(partner, roomId),
            matrixRoom(partner, `!roomId2:${matrixServer}`),
            matrixRoom(partner, `!roomId3:${matrixServer}`),
            action,
          ].reduce(raidenReducer, state),
        );

      const promise = matrixLeaveExcessRoomsEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_ROOM_LEAVE,
        address: partner,
        roomId,
      });
      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);
    });
  });

  describe('matrixLeaveUnknownRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();

      jest.useFakeTimers();
    });

    test(
      'leave unknown rooms',
      fakeSchedulers(advance => {
        expect.assertions(3);
        const roomId = `!unknownRoomId:${matrixServer}`,
          state$ = of(state);

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        expect(matrix.leave).toHaveBeenCalledTimes(1);
        expect(matrix.leave).toHaveBeenCalledWith(roomId);

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave discovery room',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = `!discoveryRoomId:${matrixServer}`,
          state$ = of(state);

        matrix.getRoom.mockReturnValueOnce({
          roomId,
          name: `#raiden_${depsMock.network.name}_discovery:${matrixServer}`,
          getMember: jest.fn(),
          getJoinedMembers: jest.fn(() => []),
        });

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        // even after some time, discovery room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave peers rooms',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = `!partnerRoomId:${matrixServer}`,
          state$ = of(raidenReducer(state, matrixRoom(partner, roomId)));

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        // even after some time, partner's room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );
  });

  describe('matrixCleanLeftRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('clean left rooms', async () => {
      expect.assertions(1);

      const roomId = `!partnerRoomId:${matrixServer}`,
        state$ = of(raidenReducer(state, matrixRoom(partner, roomId)));

      const promise = matrixCleanLeftRoomsEpic(EMPTY, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MATRIX_ROOM_LEAVE,
        address: partner,
        roomId,
      });
    });
  });

  describe('matrixMessageSendEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('send: all needed objects in place', async () => {
      expect.assertions(2);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        message = 'test message',
        action$ = of(
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
          messageSend(partner, message),
        ),
        state$ = of([matrixRoom(partner, roomId)].reduce(raidenReducer, state));

      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(userId => ({
          roomId,
          userId,
          name: userId,
          membership: 'join',
          user: null,
        })),
        getJoinedMembers: jest.fn(() => []),
      });

      const sub = matrixMessageSendEpic(action$, state$, depsMock).subscribe();

      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );

      sub.unsubscribe();
    });

    test('send: Room appears late, user joins late', async () => {
      expect.assertions(3);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        message = 'test message',
        action$ = of(
          matrixPresenceUpdate(partner, partnerUserId, true, 123),
          messageSend(partner, message),
        ),
        state$ = of([matrixRoom(partner, roomId)].reduce(raidenReducer, state));

      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixMessageSendEpic(action$, state$, depsMock).subscribe();

      expect(matrix.sendEvent).not.toHaveBeenCalled();

      // a wild Room appears
      matrix.emit('Room', {
        roomId,
        name: roomId,
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
      });

      // user joins later
      matrix.emit(
        'RoomMember.membership',
        {},
        { roomId, userId: partnerUserId, name: partnerUserId, membership: 'join' },
      );

      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );

      sub.unsubscribe();
    });
  });

  describe('matrixMessageReceivedEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('receive: late presence and late room', async () => {
      expect.assertions(1);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        message = 'test message',
        action$ = new Subject<RaidenActions>(),
        state$ = new BehaviorSubject<RaidenState>(state);

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId },
      );

      // actions sees presence update for patner only later
      action$.next(matrixPresenceUpdate(partner, partnerUserId, true, 123));
      // state includes room for partner only later
      state$.next([matrixRoom(partner, roomId)].reduce(raidenReducer, state));

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: RaidenActionType.MESSAGE_RECEIVED,
        address: partner,
        message,
        ts: expect.any(Number),
        userId: partnerUserId,
        roomId,
      });
    });
  });

  describe('matrixMessageReceivedUpdateRoomEpic', () => {
    test('messageReceived on second room emits matrixRoom', async () => {
      expect.assertions(1);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        action$ = of(messageReceived(partner, 'test message', 123, partnerUserId, roomId)),
        state$ = of(
          [
            matrixRoom(partner, roomId),
            // newRoom becomes first 'choice', roomId goes second
            matrixRoom(partner, `!newRoomId_for_partner:${matrixServer}`),
          ].reduce(raidenReducer, state),
        );

      const promise = matrixMessageReceivedUpdateRoomEpic(action$, state$).toPromise();

      // then it resolves
      await expect(promise).resolves.toEqual(matrixRoom(partner, roomId));
    });
  });
});
