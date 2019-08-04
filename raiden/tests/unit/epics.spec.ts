/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */
import { raidenEpicDeps, makeLog, makeMatrix, makeSignature } from './mocks';

import {
  AsyncSubject,
  BehaviorSubject,
  merge,
  of,
  from,
  timer,
  EMPTY,
  Subject,
  Observable,
} from 'rxjs';
import { first, tap, ignoreElements, takeUntil, toArray, delay, filter } from 'rxjs/operators';
import { marbles, fakeSchedulers } from 'rxjs-marbles/jest';
import { getType, isActionOf } from 'typesafe-actions';
import { range } from 'lodash';

import { Wallet } from 'ethers';
import { AddressZero, Zero, HashZero } from 'ethers/constants';
import { bigNumberify, verifyMessage, BigNumber, keccak256 } from 'ethers/utils';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { ContractTransaction } from 'ethers/contract';

jest.mock('matrix-js-sdk');
import { createClient } from 'matrix-js-sdk';

jest.mock('cross-fetch');
import fetch from 'cross-fetch';

import { ShutdownReason } from 'raiden/constants';
import { RaidenAction } from 'raiden/actions';
import { raidenReducer } from 'raiden/reducer';
import { RaidenState, initialState } from 'raiden/store/state';
import { raidenInit, raidenShutdown } from 'raiden/store/actions';
import {
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
  channelOpenFailed,
  channelDepositFailed,
  channelCloseFailed,
  channelSettleFailed,
} from 'raiden/channels/actions';
import {
  matrixRequestMonitorPresence,
  matrixPresenceUpdate,
  matrixRoom,
  matrixSetup,
  matrixRequestMonitorPresenceFailed,
  matrixRoomLeave,
} from 'raiden/transport/actions';
import { messageSend, messageReceived } from 'raiden/messages/actions';

import { raidenRootEpic } from 'raiden/epics';
import {
  initMonitorProviderEpic,
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
  channelMonitoredEpic,
  channelSettleableEpic,
  tokenMonitoredEpic,
} from 'raiden/channels/epics';
import {
  initMatrixEpic,
  matrixMonitorChannelPresenceEpic,
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
  deliveredEpic,
} from 'raiden/transport/epics';
import { stateOutputEpic, actionOutputEpic } from 'raiden/store/epics';
import { Address, Hash, UInt } from 'raiden/utils/types';
import {
  MessageType,
  Signed,
  Processed,
  Delivered,
  LockedTransfer,
  SecretRequest,
  SecretReveal,
} from 'raiden/messages/types';
import { makeMessageId, makeSecret } from 'raiden/transfers/utils';
import { encodeJsonMessage, signMessage } from 'raiden/messages/utils';
import {
  transfer,
  transferSigned,
  transferSecret,
  transferFailed,
  transferUnlock,
  transferUnlocked,
  transferProcessed,
  transferSecretRequest,
  transferSecretReveal,
} from 'raiden/transfers/actions';
import {
  transferGenerateAndSignEnvelopeMessageEpic,
  transferProcessedReceivedEpic,
  transferSecretRequestedEpic,
  transferSecretRevealEpic,
  transferSecretRevealedEpic,
  transferUnlockProcessedReceivedEpic,
} from 'raiden/transfers/epics';

describe('raidenRootEpic', () => {
  // mocks for all RaidenEpicDeps properties
  const depsMock = raidenEpicDeps();
  const state: RaidenState = {
    ...initialState,
    address: depsMock.address,
    blockNumber: 125,
  };

  const token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partnerSigner = new Wallet(
      '0x3333333333333333333333333333333333333333333333333333333333333333',
    ),
    partner = partnerSigner.address as Address,
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash;
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
      of<RaidenAction>(),
      of<RaidenState>(state),
      depsMock,
    ).toPromise();

    // stateOutputEpic is an state sink and doesn't emit any action
    await expect(epicPromise).resolves.toBeUndefined();
    // stateOutput$ completes (because state$ completed) and last value was our last emitted state
    await expect(outputPromise).resolves.toMatchObject({ blockNumber: state.blockNumber });
  });

  test('actionOutputEpic', async () => {
    const action = newBlock({ blockNumber: 123 }); // a random action
    const outputPromise = depsMock.actionOutput$.toPromise();
    const epicPromise = actionOutputEpic(
      of<RaidenAction>(action),
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
          tokenMonitored({ token, tokenNetwork, first: true }),
          channelOpened(
            { id: channelId, settleTimeout, openBlock: 121, txHash },
            { tokenNetwork, partner },
          ),
          channelDeposited(
            {
              id: channelId,
              participant: depsMock.address,
              totalDeposit: bigNumberify(200),
              txHash,
            },
            { tokenNetwork, partner },
          ),
          channelDeposited(
            {
              id: channelId,
              participant: partner,
              totalDeposit: bigNumberify(200),
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
        const action$ = m.cold('---a------d|', {
            a: raidenInit(),
            d: raidenShutdown({ reason: ShutdownReason.STOP }),
          }),
          state$ = m.cold('--s---|', { s: newState }),
          emitBlock$ = m.cold('----------b-|').pipe(
            tap(() => depsMock.provider.emit('block', 634)),
            ignoreElements(),
          );
        m.expect(merge(emitBlock$, raidenRootEpic(action$, state$, depsMock))).toBeObservable(
          m.cold('---(tc)---b-|', {
            t: tokenMonitored({ token, tokenNetwork, first: false }),
            // ensure channelMonitored is emitted by raidenInit even for 'settling' channel
            c: channelMonitored({ id: channelId }, { tokenNetwork, partner }),
            b: newBlock({ blockNumber: 634 }),
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
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }));
    });

    test('ShutdownReason.NETWORK_CHANGED', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);

      depsMock.provider.getNetwork.mockResolvedValueOnce({ chainId: 899, name: 'unknown' });

      await expect(
        initMonitorProviderEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }));
    });

    test('unexpected exception triggers shutdown', async () => {
      const action$ = of(raidenInit()),
        state$ = of(state);

      const error = new Error('connection lost');
      depsMock.provider.listAccounts.mockRejectedValueOnce(error);

      // whole raidenRootEpic completes upon raidenShutdown, with it as last emitted value
      await expect(raidenRootEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        raidenShutdown({ reason: error }),
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
      const action$ = of(raidenInit()),
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
    'channelSettleableEpic',
    marbles(m => {
      const closeBlock = 125;
      // state contains one channel in closed state
      const newState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock: 121, txHash },
          { tokenNetwork, partner },
        ),
        channelClosed(
          {
            id: channelId,
            participant: depsMock.address,
            closeBlock,
            txHash,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      /* first newBlock bigger than settleTimeout causes a channelSettleable to be emitted */
      const action$ = m.cold('---b-B-|', {
          b: newBlock({ blockNumber: closeBlock + settleTimeout - 1 }),
          B: newBlock({ blockNumber: closeBlock + settleTimeout + 4 }),
        }),
        state$ = m.cold('--s-|', { s: newState });
      m.expect(channelSettleableEpic(action$, state$)).toBeObservable(
        m.cold('-----S-|', {
          S: channelSettleable(
            { settleableBlock: closeBlock + settleTimeout + 4 },
            { tokenNetwork, partner },
          ),
        }),
      );
    }),
  );

  describe('tokenMonitoredEpic', () => {
    const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [settleTimeout]);

    test('first tokenMonitored with past$ ChannelOpened event', async () => {
      const action = tokenMonitored({ token, tokenNetwork, first: true }),
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

      await expect(
        tokenMonitoredEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: getType(channelOpened),
        payload: { id: channelId, settleTimeout, openBlock: 121 },
        meta: { tokenNetwork, partner },
      });
    });

    test('already tokenMonitored with new$ ChannelOpened event', async () => {
      const action = tokenMonitored({ token, tokenNetwork, first: false }),
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
      const action = tokenMonitored({ token, tokenNetwork, first: false }),
        curState = raidenReducer(state, action);
      const action$ = from(
          range(multiple).map(() => tokenMonitored({ token, tokenNetwork, first: false })),
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

  describe('chanelOpenEpic', () => {
    test('fails if channel.state !== opening', async () => {
      // there's a channel already opened in state
      const action = channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        curState = [
          tokenMonitored({ token, tokenNetwork, first: true }),
          channelOpened(
            { id: channelId, settleTimeout, openBlock: 125, txHash },
            { tokenNetwork, partner },
          ),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject({
        type: getType(channelOpenFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('tx fails', async () => {
      const action = channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        curState = [tokenMonitored({ token, tokenNetwork, first: true }), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      const tx: ContractTransaction = {
        hash: txHash,
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
        type: getType(channelOpenFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('success', async () => {
      // there's a channel already opened in state
      const action = channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        curState = [tokenMonitored({ token, tokenNetwork, first: true }), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      const tx: ContractTransaction = {
        hash: txHash,
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
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelOpened(
            { id: channelId, settleTimeout, openBlock: 125, txHash },
            { tokenNetwork, partner },
          ),
        ),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenedEpic(action$, state$).toPromise()).resolves.toBeUndefined();
    });

    test('channelOpened triggers channel monitoring', async () => {
      // channel.state is 'opening'
      const action = channelOpened(
          { id: channelId, settleTimeout, openBlock: 125, txHash },
          { tokenNetwork, partner },
        ),
        curState = [tokenMonitored({ token, tokenNetwork, first: true }), action].reduce(
          raidenReducer,
          state,
        );
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenedEpic(action$, state$).toPromise()).resolves.toMatchObject({
        type: getType(channelMonitored),
        payload: { id: channelId, fromBlock: 125 },
        meta: { tokenNetwork, partner },
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
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitored({ id: channelId, fromBlock: openBlock }, { tokenNetwork, partner }),
        ).pipe(delay(1)), // give time to state multicast to register
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
        type: getType(channelDeposited),
        payload: { id: channelId, participant: depsMock.address, totalDeposit: deposit },
        meta: { tokenNetwork, partner },
      });
    });

    test('already channelMonitored with new$ partner ChannelNewDeposit event', async () => {
      const action = channelMonitored({ id: channelId }, { tokenNetwork, partner }),
        curState = [
          tokenMonitored({ token, tokenNetwork, first: true }),
          channelOpened(
            { id: channelId, settleTimeout, openBlock, txHash },
            { tokenNetwork, partner },
          ),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
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
        type: getType(channelDeposited),
        payload: { id: channelId, participant: partner, totalDeposit: deposit },
        meta: { tokenNetwork, partner },
      });
    });

    test("ensure multiple channelMonitored don't produce duplicated events", async () => {
      const multiple = 16;
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = from(
          range(multiple).map(() =>
            channelMonitored({ id: channelId }, { tokenNetwork, partner }),
          ),
        ),
        state$ = of<RaidenState>(curState);

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
        type: getType(channelDeposited),
        payload: { id: channelId, participant: depsMock.address, totalDeposit: deposit },
        meta: { tokenNetwork, partner },
      });

      expect(depsMock.provider.on).toHaveBeenCalledTimes(3); // one for each event
    });

    test('new$ partner ChannelClosed event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitored({ id: channelId }, { tokenNetwork, partner }),
        ),
        state$ = of<RaidenState>(curState);

      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      depsMock.provider.emit(
        tokenNetworkContract.filters.ChannelClosed(channelId, null, null),
        makeLog({
          blockNumber: closeBlock,
          transactionHash: txHash,
          filter: tokenNetworkContract.filters.ChannelClosed(channelId, partner, 11),
        }),
      );

      await expect(promise).resolves.toMatchObject({
        type: getType(channelClosed),
        payload: { id: channelId, participant: partner, closeBlock, txHash },
        meta: { tokenNetwork, partner },
      });
    });

    test('new$ ChannelSettled event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        channelClosed(
          { id: channelId, participant: depsMock.address, closeBlock, txHash },
          { tokenNetwork, partner },
        ), // channel is in "closed" state already
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitored({ id: channelId }, { tokenNetwork, partner }),
        ),
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
          transactionHash: txHash,
          filter: tokenNetworkContract.filters.ChannelSettled(channelId, null, null),
          data: settleAmountsEncoded, // participants amounts aren't indexed, so they go in data
        }),
      );

      await expect(promise).resolves.toEqual(
        channelSettled({ id: channelId, settleBlock, txHash }, { tokenNetwork, partner }),
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

  describe('matrixMonitorChannelPresenceEpic', () => {
    test('channelMonitored triggers matrixRequestMonitorPresence', async () => {
      const action$ = of<RaidenAction>(
        channelMonitored({ id: channelId }, { tokenNetwork, partner }),
      );
      const promise = matrixMonitorChannelPresenceEpic(action$).toPromise();
      await expect(promise).resolves.toEqual(
        matrixRequestMonitorPresence(undefined, { address: partner }),
      );
    });
  });

  describe('channelDepositEpic', () => {
    const deposit = bigNumberify(1023),
      openBlock = 121;

    test('fails if there is no token for tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenAction>(channelDeposit({ deposit }, { tokenNetwork, partner })),
        state$ = of<RaidenState>(state);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(channelDepositFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('fails if channel.state !== "open"', async () => {
      // there's a channel already opened in state
      const action = channelDeposit({ deposit }, { tokenNetwork, partner }),
        // channel is in 'opening' state
        curState = [
          tokenMonitored({ token, tokenNetwork, first: true }),
          channelOpen({ settleTimeout }, { tokenNetwork, partner }),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      await expect(
        channelDepositEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(channelDepositFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('approve tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelDeposit({ deposit }, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: txHash,
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
        type: getType(channelDepositFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('setTotalDeposit tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelDeposit({ deposit }, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: txHash,
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
        hash: txHash,
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
        type: getType(channelDepositFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('success', async () => {
      // there's a channel already opened in state
      let curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        // own initial deposit of 330
        channelDeposited(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: bigNumberify(330),
            txHash,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelDeposit({ deposit }, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const approveTx: ContractTransaction = {
        hash: txHash,
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
        hash: txHash,
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
      const action$ = of<RaidenAction>(channelClose(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(state);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        {
          type: getType(channelCloseFailed),
          payload: expect.any(Error),
          error: true,
          meta: { tokenNetwork, partner },
        },
      );
    });

    test('fails if channel.state !== "open"|"closing"', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        // channel is in 'opening' state
        channelOpen({ settleTimeout }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelClose(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        {
          type: getType(channelCloseFailed),
          payload: expect.any(Error),
          error: true,
          meta: { tokenNetwork, partner },
        },
      );
    });

    test('closeChannel tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelClose(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const closeTx: ContractTransaction = {
        hash: txHash,
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
          type: getType(channelCloseFailed),
          payload: expect.any(Error),
          error: true,
          meta: { tokenNetwork, partner },
        },
      );
    });

    test('success', async () => {
      // there's a channel already opened in state
      let curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelClose(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const closeTx: ContractTransaction = {
        hash: txHash,
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
      const action$ = of<RaidenAction>(channelSettle(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(state);

      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(channelSettleFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('fails if channel.state !== "settleable|settling"', async () => {
      // there's a channel in closed state, but not yet settleable
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClosed(
          { id: channelId, participant: depsMock.address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelSettle(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      await expect(
        channelSettleEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(channelSettleFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('settleChannel tx fails', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClosed(
          { id: channelId, participant: depsMock.address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelSettle(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const settleTx: ContractTransaction = {
        hash: txHash,
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
        type: getType(channelSettleFailed),
        payload: expect.any(Error),
        error: true,
        meta: { tokenNetwork, partner },
      });
    });

    test('success', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored({ token, tokenNetwork, first: true }),
        channelOpened(
          { id: channelId, settleTimeout, openBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClosed(
          { id: channelId, participant: depsMock.address, closeBlock, txHash },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelSettle(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      const settleTx: ContractTransaction = {
        hash: txHash,
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
          of(
            matrixSetup({
              server: matrixServer,
              setup: { userId, accessToken, deviceId, displayName },
            }),
          ),
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
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
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
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
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
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
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
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
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
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          matrixRequestMonitorPresence(undefined, { address: partner }),
        ),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success with matrix cached user', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
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
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
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
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
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
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: false, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('update without changing availability does not emit', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
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
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
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
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
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
          messageSend({ message: 'message1' }, { address: partner }),
          messageSend({ message: 'message2' }, { address: partner }),
          messageSend({ message: 'message3' }, { address: partner }),
          messageSend({ message: 'message4' }, { address: partner }),
          messageSend({ message: 'message5' }, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
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
        type: getType(matrixRoom),
        payload: { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
        meta: { address: partner },
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
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', async () => {
      expect.assertions(3);
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        roomId = `!roomId_for_partner:${matrixServer}`,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

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
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
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
        type: getType(matrixRoom),
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const action$ = new Subject<RaidenAction>(),
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

      action$.next(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
      );

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoom),
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('do not accept invites from non-monitored peers', async () => {
      expect.assertions(2);
      const action$ = of<RaidenAction>(),
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
        action = matrixRoom(
          { roomId: `!frontRoomId_for_partner:${matrixServer}` },
          { address: partner },
        ),
        action$ = of(action),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            matrixRoom({ roomId: `!roomId2:${matrixServer}` }, { address: partner }),
            matrixRoom({ roomId: `!roomId3:${matrixServer}` }, { address: partner }),
            action,
          ].reduce(raidenReducer, state),
        );

      const promise = matrixLeaveExcessRoomsEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoomLeave),
        payload: { roomId },
        meta: { address: partner },
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
          state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

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
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const promise = matrixCleanLeftRoomsEpic(EMPTY, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoomLeave),
        payload: { roomId },
        meta: { address: partner },
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
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          messageSend({ message }, { address: partner }),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

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
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          messageSend({ message }, { address: partner }),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

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
        action$ = new Subject<RaidenAction>(),
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

      // actions sees presence update for partner only later
      action$.next(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
      );
      // state includes room for partner only later
      state$.next(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });

    test('receive: decode signed message', async () => {
      expect.assertions(1);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        signed = await signMessage(partnerSigner, {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
        }),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        ),
        state$ = of([matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state));

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

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          message: {
            type: MessageType.PROCESSED,
            message_identifier: expect.any(BigNumber),
            signature: expect.any(String),
          },
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });

    test('receive: refuse messages not signed by sender', async () => {
      expect.assertions(1);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        // signed by ourselves
        signed = await signMessage(depsMock.signer, {
          type: MessageType.PROCESSED,
          message_identifier: makeMessageId(),
        }),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        ),
        state$ = of([matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state));

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

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          message: undefined,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });
  });

  describe('matrixMessageReceivedUpdateRoomEpic', () => {
    test('messageReceived on second room emits matrixRoom', async () => {
      expect.assertions(1);

      const roomId = `!roomId_for_partner:${matrixServer}`,
        action$ = of(
          messageReceived(
            { text: 'test message', ts: 123, userId: partnerUserId, roomId },
            { address: partner },
          ),
        ),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            // newRoom becomes first 'choice', roomId goes second
            matrixRoom({ roomId: `!newRoomId_for_partner:${matrixServer}` }, { address: partner }),
          ].reduce(raidenReducer, state),
        );

      const promise = matrixMessageReceivedUpdateRoomEpic(action$, state$).toPromise();

      // then it resolves
      await expect(promise).resolves.toEqual(matrixRoom({ roomId }, { address: partner }));
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
        roomId = `!roomId_for_partner:${matrixServer}`,
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
        roomId = `!roomId_for_partner:${matrixServer}`,
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

  describe('transferGenerateAndSignEnvelopeMessageEpic', () => {
    const secret = makeSecret(),
      secrethash = keccak256(secret) as Hash,
      amount = bigNumberify(10) as UInt<32>,
      openBlock = 121;

    test('transferSigned success and cached', async () => {
      expect.assertions(2);

      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
          // double transfer to test caching
          transfer({ tokenNetwork, target: partner, amount }, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap(action => state$.next(raidenReducer(state$.value, action))),
          toArray(),
        )
        .toPromise();

      expect(output).toEqual(
        expect.arrayContaining([
          {
            type: getType(transferSecret),
            payload: { secret },
            meta: { secrethash },
          },
          {
            type: getType(transferSigned),
            payload: {
              message: expect.objectContaining({
                type: MessageType.LOCKED_TRANSFER,
                message_identifier: expect.any(BigNumber),
                signature: expect.any(String),
              }),
            },
            meta: { secrethash },
          },
        ]),
      );

      // second transfer should have been cached
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('transferSigned fail no route', async () => {
      expect.assertions(1);

      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        closingPartner = '0x0100000000000000000000000000000000000000' as Address,
        noCapPartner = '0x0200000000000000000000000000000000000000' as Address,
        offlinePartner = '0x0300000000000000000000000000000000000000' as Address,
        state$ = of(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            // channel with closingPartner: closed
            channelOpened(
              { id: channelId + 1, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner: closingPartner },
            ),
            channelClosed(
              {
                id: channelId + 1,
                participant: closingPartner,
                closeBlock: openBlock + 1,
                txHash,
              },
              { tokenNetwork, partner: closingPartner },
            ),
            // channel with noCapPartner: open but no deposit
            channelOpened(
              { id: channelId + 2, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner: noCapPartner },
            ),
            // channel with partner: enough capacity but partner is offline
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner: offlinePartner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner: offlinePartner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: getType(transferFailed),
        payload: expect.any(Error),
        error: true,
        meta: { secrethash },
      });
    });

    test('transferSigned fail target not monitored', async () => {
      expect.assertions(1);

      const action$ = of(
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = of(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: getType(transferFailed),
        payload: expect.any(Error),
        error: true,
        meta: { secrethash },
      });
    });

    test('transferSigned fail target not available', async () => {
      expect.assertions(1);

      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: false }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = of(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: getType(transferFailed),
        payload: expect.any(Error),
        error: true,
        meta: { secrethash },
      });
    });

    test('transferSigned fail invalid secret', async () => {
      expect.assertions(1);

      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret: txHash }, { secrethash }),
        ),
        state$ = of(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
          .pipe(first())
          .toPromise(),
      ).resolves.toMatchObject({
        type: getType(transferFailed),
        payload: expect.any(Error),
        error: true,
        meta: { secrethash },
      });
    });

    test('transferUnlock success and cached', async () => {
      expect.assertions(2);

      // secret revealed action is only ever emitted when received from recipient
      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
          transferUnlock(undefined, { secrethash }),
          transferUnlock(undefined, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap(action => state$.next(raidenReducer(state$.value, action))),
          toArray(),
        )
        .toPromise();

      expect(output).toEqual(
        expect.arrayContaining([
          {
            type: getType(transferUnlocked),
            payload: {
              message: expect.objectContaining({
                type: MessageType.UNLOCK,
                locksroot: HashZero,
                transferred_amount: amount,
                locked_amount: Zero,
                message_identifier: expect.any(BigNumber),
                signature: expect.any(String),
              }),
            },
            meta: { secrethash },
          },
        ]),
      );

      // transfer signs once, then 1st unlock
      // 2nd unlock should be cached
      expect(signerSpy).toHaveBeenCalledTimes(2);
      signerSpy.mockRestore();
    });

    test('transferUnlock fail channel gone', async () => {
      expect.assertions(2);

      // secret revealed action is only ever emitted when received from recipient
      let action$: Observable<RaidenAction> = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const signed = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(filter(isActionOf(transferSigned)))
        .toPromise();

      // update state: transfer still pending, but channel gets settled
      const closeBlock = 125;
      state$.next(
        [
          signed,
          channelClosed(
            { id: channelId, participant: partner, closeBlock, txHash },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: closeBlock + settleTimeout + 1 }),
          channelSettled(
            { id: channelId, settleBlock: closeBlock + settleTimeout + 1, txHash },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: closeBlock + settleTimeout + 2 }),
        ].reduce(raidenReducer, state$.value),
      );

      action$ = of(transferUnlock(undefined, { secrethash }));

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();

      expect(output).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ type: getType(transferUnlocked), meta: { secrethash } }),
        ]),
      );

      // unlock shouldn't be called and signed
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });

    test('transferUnlock fail channel closed', async () => {
      expect.assertions(2);

      // secret revealed action is only ever emitted when received from recipient
      let action$: Observable<RaidenAction> = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const signed = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(filter(isActionOf(transferSigned)))
        .toPromise();

      // update state: transfer still pending, but channel gets settled
      const closeBlock = 125;
      state$.next(
        [
          signed,
          channelClosed(
            { id: channelId, participant: partner, closeBlock, txHash },
            { tokenNetwork, partner },
          ),
          newBlock({ blockNumber: closeBlock + 1 }),
        ].reduce(raidenReducer, state$.value),
      );

      action$ = of(transferUnlock(undefined, { secrethash }));

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();

      expect(output).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ type: getType(transferUnlocked), meta: { secrethash } }),
        ]),
      );

      // unlock shouldn't be called and signed
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });

    test('transferUnlock fail lock expired', async () => {
      expect.assertions(2);

      // secret revealed action is only ever emitted when received from recipient
      let action$: Observable<RaidenAction> = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const signed = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(filter(isActionOf(transferSigned)))
        .toPromise();

      // update state: transfer still pending, but channel gets settled
      const closeBlock = 125;
      state$.next(
        [signed, newBlock({ blockNumber: closeBlock + settleTimeout + 1 })].reduce(
          raidenReducer,
          state$.value,
        ),
      );

      action$ = of(transferUnlock(undefined, { secrethash }));

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();

      expect(output).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ type: getType(transferUnlocked), meta: { secrethash } }),
        ]),
      );

      // unlock shouldn't be called and signed
      expect(signerSpy).toHaveBeenCalledTimes(0);
      signerSpy.mockRestore();
    });
  });

  describe('transfer epics: depending on pending transfer', () => {
    const secret = makeSecret(),
      secrethash = keccak256(secret) as Hash,
      amount = bigNumberify(10) as UInt<32>,
      openBlock = 121;

    let transferingState: RaidenState, signedTransfer: Signed<LockedTransfer>;

    beforeAll(async () => {
      let action$: Observable<RaidenAction> = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          transfer({ tokenNetwork, target: partner, amount, secret }, { secrethash }),
        ),
        state$ = new BehaviorSubject(
          [
            tokenMonitored({ token, tokenNetwork, first: true }),
            channelOpened(
              { id: channelId, settleTimeout, openBlock, txHash },
              { tokenNetwork, partner },
            ),
            channelDeposited(
              {
                id: channelId,
                participant: depsMock.address,
                totalDeposit: bigNumberify(500),
                txHash,
              },
              { tokenNetwork, partner },
            ),
            newBlock({ blockNumber: 125 }),
          ].reduce(raidenReducer, state),
        );

      const output = await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(toArray())
        .toPromise();
      for (const action of output) {
        if (isActionOf(transferSigned, action)) {
          signedTransfer = action.payload.message;
        }
      }

      state$.next([...output, newBlock({ blockNumber: 126 })].reduce(raidenReducer, state$.value));
      transferingState = state$.value;
    });

    test('transferProcessedReceivedEpic: success', async () => {
      const message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: signedTransfer.message_identifier,
        },
        signed = await signMessage(partnerSigner, message),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(transferProcessedReceivedEpic(action$, state$).toPromise()).resolves.toEqual(
        transferProcessed({ message: signed }, { secrethash }),
      );
    });

    test('transferProcessedReceivedEpic: ignore non processed and signed', async () => {
      const message: Delivered = {
          type: MessageType.DELIVERED,
          delivered_message_identifier: signedTransfer.message_identifier,
        },
        signed = await signMessage(partnerSigner, message),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(
        transferProcessedReceivedEpic(action$, state$).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('transferProcessedReceivedEpic: ignore non-matching message id', async () => {
      const message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: signedTransfer.payment_identifier,
        },
        signed = await signMessage(partnerSigner, message),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(
        transferProcessedReceivedEpic(action$, state$).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('transferSecretRequestedEpic: success', async () => {
      const message: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount,
          expiration: signedTransfer.lock.expiration,
        },
        signed = await signMessage(partnerSigner, message),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(transferSecretRequestedEpic(action$, state$).toPromise()).resolves.toEqual(
        transferSecretRequest({ message: signed }, { secrethash }),
      );
    });

    test('transferSecretRequestedEpic: ignore invalid lock', async () => {
      const message: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount,
          expiration: amount, // invalid expiration
        },
        signed = await signMessage(partnerSigner, message),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(
        transferSecretRequestedEpic(action$, state$).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('transferRevealSecretEpic: success and cached', async () => {
      expect.assertions(2);

      const request: SecretRequest = {
          type: MessageType.SECRET_REQUEST,
          message_identifier: makeMessageId(),
          payment_identifier: signedTransfer.payment_identifier,
          secrethash,
          amount,
          expiration: signedTransfer.lock.expiration,
        },
        signed = await signMessage(partnerSigner, request),
        action$ = of(
          transferSecretRequest({ message: signed }, { secrethash }),
          transferSecretRequest({ message: signed }, { secrethash }),
        ),
        state$ = new BehaviorSubject<RaidenState>(transferingState);

      const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

      await expect(
        transferSecretRevealEpic(action$, state$, depsMock)
          .pipe(
            tap(action => state$.next(raidenReducer(state$.value, action))),
            toArray(),
          )
          .toPromise(),
      ).resolves.toEqual(
        expect.arrayContaining([
          {
            type: getType(transferSecretReveal),
            payload: {
              message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }),
            },
            meta: { secrethash },
          },
          {
            type: getType(messageSend),
            payload: {
              message: expect.objectContaining({ type: MessageType.SECRET_REVEAL, secret }),
            },
            meta: { address: partner },
          },
        ]),
      );

      // second transfer should have been cached
      expect(signerSpy).toHaveBeenCalledTimes(1);
      signerSpy.mockRestore();
    });

    test('transferSecretRevealedEpic: success', async () => {
      expect.assertions(1);

      const reveal: SecretReveal = {
          type: MessageType.SECRET_REVEAL,
          message_identifier: makeMessageId(),
          secret,
        },
        signed = await signMessage(partnerSigner, reveal),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: partner },
          ),
        ),
        state$ = of(transferingState);

      await expect(transferSecretRevealedEpic(action$, state$).toPromise()).resolves.toEqual(
        transferUnlock(undefined, { secrethash }),
      );
    });

    test('transferSecretRevealedEpic: ignores if not from recipient/neighbor', async () => {
      expect.assertions(1);

      const reveal: SecretReveal = {
          type: MessageType.SECRET_REVEAL,
          message_identifier: makeMessageId(),
          secret,
        },
        signed = await signMessage(depsMock.signer, reveal),
        action$ = of(
          messageReceived(
            { text: encodeJsonMessage(signed), message: signed },
            { address: depsMock.address },
          ),
        ),
        state$ = of(transferingState);

      await expect(
        transferSecretRevealedEpic(action$, state$).toPromise(),
      ).resolves.toBeUndefined();
    });

    test('transferUnlockProcessedReceivedEpic: success', async () => {
      let action$: Observable<RaidenAction> = of(transferUnlock(undefined, { secrethash })),
        state$ = new BehaviorSubject(transferingState);

      const unlock = (await transferGenerateAndSignEnvelopeMessageEpic(action$, state$, depsMock)
        .pipe(
          tap(action => state$.next(raidenReducer(state$.value, action))),
          filter(isActionOf(transferUnlocked)),
        )
        .toPromise()).payload.message;

      const message: Processed = {
          type: MessageType.PROCESSED,
          message_identifier: unlock.message_identifier,
        },
        signed = await signMessage(partnerSigner, message);
      action$ = of(
        messageReceived(
          { text: encodeJsonMessage(signed), message: signed },
          { address: partner },
        ),
      );

      await expect(
        transferUnlockProcessedReceivedEpic(action$, state$).toPromise(),
        // ).resolves.toEqual(transferUnlockProcessed({ message: signed }, { secrethash }));
      ).resolves.toBeDefined();
    });
  });
});
