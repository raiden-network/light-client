/* eslint-disable @typescript-eslint/no-explicit-any */
import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeLog } from '../mocks';

import { marbles } from 'rxjs-marbles/jest';
import { of, from, timer, Observable, EMPTY, merge, ReplaySubject } from 'rxjs';
import { first, takeUntil, toArray, delay, tap, ignoreElements } from 'rxjs/operators';
import { bigNumberify } from 'ethers/utils';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { range } from 'lodash';

import { UInt } from 'raiden-ts/utils/types';
import { RaidenAction, raidenShutdown, raidenConfigUpdate } from 'raiden-ts/actions';
import { RaidenState } from 'raiden-ts/state';
import {
  newBlock,
  tokenMonitored,
  channelMonitor,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettleable,
  channelSettle,
} from 'raiden-ts/channels/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { raidenRootEpic } from 'raiden-ts/epics';
import {
  initMonitorProviderEpic,
  tokenMonitoredEpic,
  initTokensRegistryEpic,
  confirmationEpic,
} from 'raiden-ts/channels/epics';
import { ShutdownReason } from 'raiden-ts/constants';
import { pluckDistinct } from 'raiden-ts/utils/rx';
import { RaidenError, ErrorCodes } from 'raiden-ts/utils/error';

describe('raiden epic', () => {
  let depsMock = raidenEpicDeps(),
    {
      token,
      tokenNetworkContract,
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
      state,
      matrixServer,
      state$,
      action$,
    } = epicFixtures(depsMock);

  const fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: jest.fn(async () => `- ${matrixServer}`),
  }));
  Object.assign(global, { fetch });

  beforeEach(() => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetworkContract,
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
      state,
      matrixServer,
      state$,
      action$,
    } = epicFixtures(depsMock));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('raiden initialization & shutdown', () => {
    test(
      'init newBlock, tokenMonitored, channelMonitor events',
      marbles((m) => {
        const newState = [
          tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
          channelOpen.success(
            {
              id: channelId,
              settleTimeout,
              isFirstParticipant,
              token,
              txHash,
              txBlock: 121,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          channelDeposit.success(
            {
              id: channelId,
              participant: depsMock.address,
              totalDeposit: bigNumberify(200) as UInt<32>,
              txHash,
              txBlock: 122,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          channelDeposit.success(
            {
              id: channelId,
              participant: partner,
              totalDeposit: bigNumberify(200) as UInt<32>,
              txHash,
              txBlock: 123,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: 128 }),
          channelClose.success(
            { id: channelId, participant: partner, txHash, txBlock: 128, confirmed: true },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: 629 }),
          channelSettleable({ settleableBlock: 629 }, { tokenNetwork, partner }),
          newBlock({ blockNumber: 633 }),
          // channel is left in 'settling' state
          channelSettle.request(undefined, { tokenNetwork, partner }),
        ].reduce(raidenReducer, state);

        /* this test requires mocked provider, or else emit is called with setTimeout and doesn't
         * run before the return of the function.
         */
        // See: https://github.com/cartant/rxjs-marbles/issues/11
        depsMock.provider.getBlockNumber.mockReturnValueOnce(
          (of(633) as unknown) as Promise<number>,
        );
        const action$ = m.cold('--b-------d|', {
            b: newBlock({ blockNumber: 634 }),
            d: raidenShutdown({ reason: ShutdownReason.STOP }),
          }),
          state$ = m.cold('-s----|', { s: newState }),
          emitBlock$ = m.cold('----------b-|').pipe(
            tap(() => depsMock.provider.emit('block', 635)),
            ignoreElements(),
          );
        m.expect(merge(emitBlock$, raidenRootEpic(action$, state$, depsMock))).toBeObservable(
          m.cold('b(tc)-----B-|', {
            b: newBlock({ blockNumber: 633 }),
            t: tokenMonitored({ token, tokenNetwork }),
            // ensure channelMonitor is emitted by init even for 'settling' channel
            c: channelMonitor({ id: channelId }, { tokenNetwork, partner }),
            B: newBlock({ blockNumber: 635 }),
          }),
        );
      }),
    );

    test('initTokensRegistryEpic: scan initially, monitor previous then', async () => {
      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 121,
          filter: depsMock.registryContract.filters.TokenNetworkCreated(token, tokenNetwork),
        }),
      ]);

      // without an open channel, TokenNetwork isn't of interest and shouldn't be monitored
      await expect(
        initTokensRegistryEpic(EMPTY, of(state), depsMock).toPromise(),
      ).resolves.toBeUndefined();

      expect(depsMock.provider.getLogs).toHaveBeenCalledTimes(3);
      expect(depsMock.provider.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          ...depsMock.registryContract.filters.TokenNetworkCreated(null, null),
          fromBlock: depsMock.contractsInfo.TokenNetworkRegistry.block_number,
          toBlock: 'latest',
        }),
      );

      depsMock.provider.getLogs.mockClear();

      // mocks getLogs for TokenNetworkCreated events
      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 121,
          filter: depsMock.registryContract.filters.TokenNetworkCreated(token, tokenNetwork),
        }),
      ]);

      // mocks getLogs for TokenNetworkCreated events
      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 122,
          filter: tokenNetworkContract.filters.ChannelOpened(
            channelId,
            depsMock.address,
            partner,
            null,
          ),
          data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
        }),
      ]);

      await expect(
        initTokensRegistryEpic(EMPTY, of(state), depsMock).pipe(toArray()).toPromise(),
      ).resolves.toEqual([tokenMonitored({ token, tokenNetwork, fromBlock: 121 })]);

      expect(depsMock.provider.getLogs).toHaveBeenCalledTimes(2);
      expect(depsMock.provider.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          address: tokenNetwork,
          topics: expect.arrayContaining([
            expect.stringMatching(depsMock.address.substr(2).toLowerCase()),
          ]),
          toBlock: 'latest',
        }),
      );

      depsMock.provider.getLogs.mockClear();

      await expect(
        initTokensRegistryEpic(
          EMPTY,
          of([tokenMonitored({ token, tokenNetwork })].reduce(raidenReducer, state)),
          depsMock,
        )
          .pipe(toArray())
          .toPromise(),
      ).resolves.toEqual([tokenMonitored({ token, tokenNetwork })]);
      expect(depsMock.provider.getLogs).toHaveBeenCalledTimes(0);
    });

    test('ShutdownReason.ACCOUNT_CHANGED', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);

      depsMock.provider.listAccounts.mockResolvedValue([]);
      // listAccounts first return array with address, then empty
      depsMock.provider.listAccounts.mockResolvedValueOnce([depsMock.address]);

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock).pipe(first()).toPromise(),
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }));
    });

    test('ShutdownReason.NETWORK_CHANGED', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);

      depsMock.provider.getNetwork.mockResolvedValueOnce({ chainId: 899, name: 'unknown' });

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock).pipe(first()).toPromise(),
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }));
    });

    test('unexpected exception triggers shutdown', async () => {
      const action$ = new ReplaySubject<RaidenAction>(1),
        state$ = depsMock.latest$.pipe(pluckDistinct('state'));
      action$.next(newBlock({ blockNumber: 122 }));

      const error = new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
      depsMock.provider.listAccounts.mockRejectedValueOnce(error);

      // whole raidenRootEpic completes upon raidenShutdown, with it as last emitted value
      await expect(raidenRootEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        raidenShutdown({ reason: expect.anything() }),
      );

      action$.complete();
    });
  });

  describe('tokenMonitoredEpic', () => {
    const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [settleTimeout]);

    test('first tokenMonitored with past$ ChannelOpened event', async () => {
      expect.assertions(2);

      const action = tokenMonitored({
          token,
          tokenNetwork,
          fromBlock: depsMock.contractsInfo.TokenNetworkRegistry.block_number + 1,
        }),
        curState = raidenReducer(state, action);
      // give time to multicast to register
      const action$ = of<RaidenAction>(action).pipe(delay(1)),
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

      const promise = tokenMonitoredEpic(action$, state$, depsMock).pipe(first()).toPromise();

      await expect(promise).resolves.toEqual(
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant: true,
            token,
            txHash: expect.any(String),
            txBlock: 121,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );

      expect(depsMock.provider.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          address: tokenNetworkContract.address,
          fromBlock: depsMock.contractsInfo.TokenNetworkRegistry.block_number + 1,
          toBlock: depsMock.provider.blockNumber,
        }),
      );
    });

    test('already tokenMonitored with new$ ChannelOpened event', async () => {
      const action = tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        curState = raidenReducer(state, action);
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      const promise = tokenMonitoredEpic(action$, state$, depsMock).pipe(first()).toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelOpened(null, null, null, null),
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

      await expect(promise).resolves.toEqual(
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant: true,
            token,
            txHash: expect.any(String),
            txBlock: 125,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test("ensure multiple tokenMonitored don't produce duplicated events", async () => {
      const multiple = 16;
      const action = tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        curState = raidenReducer(state, action);
      const action$ = from(
          range(multiple).map(() => tokenMonitored({ token, tokenNetwork, fromBlock: 1 })),
        ),
        state$ = of<RaidenState>(curState);

      const promise = tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(
          // wait a little and then complete observable, so it doesn't keep listening forever
          takeUntil(timer(100)),
          toArray(), // aggregate all emitted values in this period in a single array
        )
        .toPromise();

      // even though multiple tokenMonitored events were fired, blockchain fires a single event
      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelOpened(null, null, null, null),
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
      expect(result[0]).toEqual(
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant: true,
            token,
            txHash: expect.any(String),
            txBlock: 125,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );

      // one for channels with us, one for channels from us
      expect(depsMock.provider.on).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmationEpic', () => {
    beforeEach(() => action$.next(raidenConfigUpdate({ confirmationBlocks: 5 })));

    test('confirmed', async () => {
      expect.assertions(7);
      let output: RaidenAction | undefined = undefined;

      const sub = confirmationEpic(action$, state$, depsMock).subscribe((o) => {
        action$.next(o);
        output = o;
      });

      const currentState = async () =>
        depsMock.latest$.pipe(pluckDistinct('state'), first()).toPromise();

      const pending = channelOpen.success(
        {
          id: channelId,
          settleTimeout,
          isFirstParticipant,
          token,
          txHash,
          txBlock: 122,
          confirmed: undefined,
        },
        { tokenNetwork, partner },
      );

      action$.next(newBlock({ blockNumber: 121 }));
      action$.next(pending);
      action$.next(newBlock({ blockNumber: 122 }));

      // pending tx (confirmed=undefined) is stored in state
      await expect(currentState()).resolves.toMatchObject({
        blockNumber: 122,
        config: { confirmationBlocks: 5 },
        pendingTxs: [pending],
      });
      expect(output).toBeUndefined();

      // at least confirmationBlocks passed, but getTransactionReceipt returns invalid
      depsMock.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);
      action$.next(newBlock({ blockNumber: 127 }));

      expect(depsMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1);
      expect(output).toBeUndefined();

      // give some time to exhaustMap to be free'd
      await new Promise((resolve) => setTimeout(resolve, 10));

      // now, confirmed, but reorged to block=123
      depsMock.provider.getTransactionReceipt.mockResolvedValueOnce({
        confirmations: 6,
        blockNumber: 123,
      } as any);
      action$.next(newBlock({ blockNumber: 129 }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(depsMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(2);
      expect(output).toMatchObject({
        payload: {
          txHash,
          txBlock: 123,
          confirmed: true,
        },
      });
      await expect(currentState()).resolves.toMatchObject({
        blockNumber: 129,
        pendingTxs: [],
      });

      sub.unsubscribe();
    });

    test('confirmed', async () => {
      expect.assertions(4);
      let output: RaidenAction | undefined = undefined;

      const sub = confirmationEpic(action$, state$, depsMock).subscribe((o) => {
        action$.next(o);
        output = o;
      });

      const currentState = async () =>
        depsMock.latest$.pipe(pluckDistinct('state'), first()).toPromise();

      const pending = channelOpen.success(
        {
          id: channelId,
          settleTimeout,
          isFirstParticipant,
          token,
          txHash,
          txBlock: 122,
          confirmed: undefined,
        },
        { tokenNetwork, partner },
      );

      action$.next(newBlock({ blockNumber: 121 }));
      action$.next(pending);

      // can't get receipt, confirmationBlocks < n < 2*confirmationBlocks passed
      depsMock.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);
      action$.next(newBlock({ blockNumber: 129 }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(output).toBeUndefined();

      // still can't get receipt, n > 2*confirmationBlocks passed
      depsMock.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);
      action$.next(newBlock({ blockNumber: 133 }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(depsMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(2);
      expect(output).toMatchObject({
        payload: {
          txHash,
          txBlock: 122,
          confirmed: false,
        },
      });
      await expect(currentState()).resolves.toMatchObject({
        blockNumber: 133,
        pendingTxs: [],
      });

      sub.unsubscribe();
    });
  });
});
