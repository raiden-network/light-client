/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
jest.mock('matrix-js-sdk');

import { marbles } from 'rxjs-marbles/jest';
import { of, from, timer, BehaviorSubject, Subject, Observable, EMPTY, merge } from 'rxjs';
import {
  first,
  takeUntil,
  toArray,
  delay,
  tap,
  ignoreElements,
  take,
  finalize,
} from 'rxjs/operators';
import { bigNumberify } from 'ethers/utils';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { getType } from 'typesafe-actions';
import { range } from 'lodash';
import { createClient } from 'matrix-js-sdk';

import { UInt, Address, Signed } from 'raiden-ts/utils/types';
import { MessageType, Processed, Delivered } from 'raiden-ts/messages/types';
import { RaidenAction, raidenShutdown } from 'raiden-ts/actions';
import { RaidenState } from 'raiden-ts/state';
import {
  newBlock,
  tokenMonitored,
  channelMonitored,
  channelOpened,
  channelDeposited,
  channelClosed,
  channelSettleable,
  channelSettle,
} from 'raiden-ts/channels/actions';
import { matrixSetup } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { raidenRootEpic } from 'raiden-ts/epics';
import { initMatrixEpic, deliveredEpic } from 'raiden-ts/transport/epics';
import {
  initMonitorProviderEpic,
  tokenMonitoredEpic,
  initMonitorRegistryEpic,
} from 'raiden-ts/channels/epics';
import { ShutdownReason } from 'raiden-ts/constants';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { encodeJsonMessage } from 'raiden-ts/messages/utils';
import { messageSend, messageReceived } from 'raiden-ts/messages/actions';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeLog, makeSignature } from '../mocks';

describe('raiden epic', () => {
  let depsMock = raidenEpicDeps();
  let {
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
    userId,
    accessToken,
    deviceId,
    displayName,
    partnerRoomId,
    partnerUserId,
    matrix,
  } = epicFixtures(depsMock);

  (createClient as jest.Mock).mockReturnValue(matrix);

  Object.assign(global, {
    fetch: jest.fn(async () => ({
      ok: true,
      status: 200,
      text: jest.fn(async () => `- ${matrixServer}`),
    })),
  });

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
      userId,
      accessToken,
      deviceId,
      displayName,
      partnerRoomId,
      partnerUserId,
      matrix,
    } = epicFixtures(depsMock));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('raiden initialization & shutdown', () => {
    test(
      'init newBlock, tokenMonitored, channelMonitored events',
      marbles(m => {
        const newState = [
          tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
          channelOpened(
            { id: channelId, settleTimeout, openBlock: 121, isFirstParticipant, txHash },
            { tokenNetwork, partner },
          ),
          channelDeposited(
            {
              id: channelId,
              participant: depsMock.address,
              totalDeposit: bigNumberify(200) as UInt<32>,
              txHash,
            },
            { tokenNetwork, partner },
          ),
          channelDeposited(
            {
              id: channelId,
              participant: partner,
              totalDeposit: bigNumberify(200) as UInt<32>,
              txHash,
            },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: 128 }),
          channelClosed(
            { id: channelId, participant: partner, closeBlock: 128, txHash },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: 629 }),
          channelSettleable({ settleableBlock: 629 }, { tokenNetwork, partner }),
          newBlock({ blockNumber: 633 }),
          // channel is left in 'settling' state
          channelSettle(undefined, { tokenNetwork, partner }),
        ].reduce(raidenReducer, state);

        /* this test requires mocked provider, or else emit is called with setTimeout and doesn't
         * run before the return of the function.
         */
        // See: https://github.com/cartant/rxjs-marbles/issues/11
        depsMock.provider.getBlockNumber.mockReturnValueOnce((of(633) as unknown) as Promise<
          number
        >);
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
            // ensure channelMonitored is emitted by init even for 'settling' channel
            c: channelMonitored({ id: channelId }, { tokenNetwork, partner }),
            B: newBlock({ blockNumber: 635 }),
          }),
        );
      }),
    );

    test('monitorRegistry: fetch past and new tokenNetworks', async () => {
      expect.assertions(2);
      const state$ = new BehaviorSubject(state),
        action$ = new Subject<RaidenAction>(),
        otherToken = '0x0000000000000000000000000000000000080001' as Address,
        otherTokenNetwork = '0x0000000000000000000000000000000000090001' as Address;

      action$.subscribe(action => state$.next(raidenReducer(state$.value, action)));

      state$.next(raidenReducer(state$.value, newBlock({ blockNumber: 126 })));
      depsMock.provider.resetEventsBlock(state$.value.blockNumber);

      depsMock.provider.getLogs.mockResolvedValueOnce([
        makeLog({
          blockNumber: 121,
          filter: depsMock.registryContract.filters.TokenNetworkCreated(token, tokenNetwork),
        }),
      ]);

      const output = initMonitorRegistryEpic(action$, state$, depsMock)
        .pipe(
          tap(action => state$.next(raidenReducer(state$.value, action))),
          take(2),
          finalize(() => (action$.complete(), state$.complete())),
          toArray(),
        )
        .toPromise();

      depsMock.provider.resetEventsBlock(127);
      action$.next(newBlock({ blockNumber: 127 }));

      setTimeout(
        () =>
          depsMock.provider.emit(
            depsMock.registryContract.filters.TokenNetworkCreated(null, null),
            makeLog({
              blockNumber: 127,
              filter: depsMock.registryContract.filters.TokenNetworkCreated(
                otherToken,
                otherTokenNetwork,
              ),
            }),
          ),
        10,
      );

      await expect(output).resolves.toEqual([
        tokenMonitored({ token, tokenNetwork, fromBlock: 121 }),
        tokenMonitored({ token: otherToken, tokenNetwork: otherTokenNetwork, fromBlock: 127 }),
      ]);
      expect(depsMock.provider.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          ...depsMock.registryContract.filters.TokenNetworkCreated(null, null),
          fromBlock: depsMock.contractsInfo.TokenNetworkRegistry.block_number,
          toBlock: 126,
        }),
      );

      action$.complete();
      state$.complete();
    });

    test('ShutdownReason.ACCOUNT_CHANGED', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);

      depsMock.provider.listAccounts.mockResolvedValue([]);
      // listAccounts first return array with address, then empty
      depsMock.provider.listAccounts.mockResolvedValueOnce([depsMock.address]);

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }));
    });

    test('ShutdownReason.NETWORK_CHANGED', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);

      depsMock.provider.getNetwork.mockResolvedValueOnce({ chainId: 899, name: 'unknown' });

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }));
    });

    test('unexpected exception triggers shutdown', async () => {
      const action$ = of(newBlock({ blockNumber: 122 })),
        state$ = of(state);

      const error = new Error('connection lost');
      depsMock.provider.listAccounts.mockRejectedValueOnce(error);

      // whole raidenRootEpic completes upon raidenShutdown, with it as last emitted value
      await expect(raidenRootEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        raidenShutdown({ reason: error }),
      );
    });

    test('matrix stored setup', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
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
        type: getType(matrixSetup),
        payload: {
          server: matrixServer,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        },
      });
    });

    test('matrix fetch servers list', async () => {
      const action$ = EMPTY as Observable<RaidenAction>,
        state$ = of(state);
      await expect(initMatrixEpic(action$, state$, depsMock).toPromise()).resolves.toEqual({
        type: getType(matrixSetup),
        payload: {
          server: `https://${matrixServer}`,
          setup: {
            userId,
            accessToken: expect.any(String),
            deviceId: expect.any(String),
            displayName: expect.any(String),
          },
        },
      });
    });

    test('matrix throws if can not fetch servers list', async () => {
      expect.assertions(2);
      const action$ = EMPTY as Observable<RaidenAction>,
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
      const action$ = EMPTY as Observable<RaidenAction>,
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

      const promise = tokenMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      await expect(promise).resolves.toMatchObject({
        type: getType(channelOpened),
        payload: { id: channelId, settleTimeout, openBlock: 121 },
        meta: { tokenNetwork, partner },
      });

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
        type: getType(channelOpened),
        payload: { id: channelId, settleTimeout, openBlock: 125 },
        meta: { tokenNetwork, partner },
      });
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
        type: getType(channelOpened),
        payload: { id: channelId, settleTimeout, openBlock: 125 },
        meta: { tokenNetwork, partner },
      });

      // one for channels with us, one for channels from us
      expect(depsMock.provider.on).toHaveBeenCalledTimes(2);
    });
  });

  describe('deliveredEpic', () => {
    test('success with cached', async () => {
      expect.assertions(4);

      const message: Signed<Processed> = {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        action = messageReceived(
          {
            text: encodeJsonMessage(message),
            message,
            ts: 123,
            userId: partnerUserId,
            roomId,
          },
          { address: partner },
        ),
        action$ = of(action, action);

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = deliveredEpic(action$, EMPTY, depsMock)
        .pipe(toArray())
        .toPromise();

      const output = await promise;
      expect(output).toHaveLength(2);
      expect(output[1]).toMatchObject({
        type: getType(messageSend),
        payload: {
          message: {
            type: MessageType.DELIVERED,
            delivered_message_identifier: message.message_identifier,
            signature: expect.any(String),
          },
        },
        meta: { address: partner },
      });
      expect(output[0].payload.message).toBe(output[1].payload.message); // same cached object

      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('do not reply if not message type which should be replied', async () => {
      expect.assertions(2);

      // Delivered messages aren't in the set of messages which get replied with a Delivered
      const message: Signed<Delivered> = {
          type: MessageType.DELIVERED,
          delivered_message_identifier: makeMessageId(),
          signature: makeSignature(),
        },
        roomId = partnerRoomId,
        action$ = of(
          messageReceived(
            {
              text: encodeJsonMessage(message),
              message,
              ts: 123,
              userId: partnerUserId,
              roomId,
            },
            { address: partner },
          ),
        );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
      const promise = deliveredEpic(action$, EMPTY, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });
  });
});
