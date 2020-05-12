/* eslint-disable @typescript-eslint/camelcase */
import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeLog } from '../mocks';

import { marbles } from 'rxjs-marbles/jest';
import { of, from, timer, concat } from 'rxjs';
import { first, toArray, pluck, tap, ignoreElements } from 'rxjs/operators';
import { ContractTransaction } from 'ethers/contract';
import { bigNumberify, BigNumber } from 'ethers/utils';
import { Zero, HashZero, One } from 'ethers/constants';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';
import { range } from 'lodash';

import { UInt, Int } from 'raiden-ts/utils/types';
import { RaidenAction, raidenConfigUpdate } from 'raiden-ts/actions';
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
  channelWithdrawn,
} from 'raiden-ts/channels/actions';
import {
  channelOpenEpic,
  channelOpenedEpic,
  channelDepositEpic,
  channelCloseEpic,
  channelSettleEpic,
  channelMonitoredEpic,
  channelSettleableEpic,
  channelUpdateEpic,
  channelUnlockEpic,
} from 'raiden-ts/channels/epics';
import { raidenReducer } from 'raiden-ts/reducer';
import { getLatest$ } from 'raiden-ts/epics';
import {
  makeSecret,
  getSecrethash,
  makePaymentId,
  makeMessageId,
  getLocksroot,
} from 'raiden-ts/transfers/utils';
import { Direction } from 'raiden-ts/transfers/state';
import { MessageType } from 'raiden-ts/messages/types';
import { signMessage } from 'raiden-ts/messages/utils';
import { transferSigned, transferUnlock } from 'raiden-ts/transfers/actions';

describe('channels epic', () => {
  const depsMock = raidenEpicDeps();
  const {
    token,
    tokenContract,
    tokenNetworkContract,
    tokenNetwork,
    channelId,
    partner,
    settleTimeout,
    isFirstParticipant,
    txHash,
    state,
  } = epicFixtures(depsMock);

  beforeEach(async () => {
    // reset depsMock.latest$ to state
    await getLatest$(of(raidenConfigUpdate({})), of(state), depsMock)
      .pipe(tap((latest) => depsMock.latest$.next(latest)))
      .toPromise();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test(
    'channelSettleableEpic',
    marbles((m) => {
      const closeBlock = 125;
      // state contains one channel in closed state
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
        channelClose.success(
          {
            id: channelId,
            participant: depsMock.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
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

  describe('channelOpenEpic', () => {
    test('fails if channel.state !== opening', async () => {
      // there's a channel already opened in state
      const action = channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
        curState = [
          tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
          channelOpen.success(
            {
              id: channelId,
              settleTimeout,
              isFirstParticipant,
              token,
              txHash,
              txBlock: 125,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelOpenEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelOpen.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('tx fails', async () => {
      const action = channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
        curState = [tokenMonitored({ token, tokenNetwork, fromBlock: 1 }), action].reduce(
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

      await expect(channelOpenEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelOpen.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('success', async () => {
      // there's a channel already opened in state
      const action = channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
        curState = [tokenMonitored({ token, tokenNetwork, fromBlock: 1 }), action].reduce(
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

      // result is undefined on success as the respective channelOpen.success is emitted by the
      // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
      await expect(
        channelOpenEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(tokenNetworkContract.functions.openChannel).toHaveBeenCalledTimes(1);
      expect(tx.wait).toHaveBeenCalledTimes(1);
    });
  });

  test('channelOpenedEpic', async () => {
    const {
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
    } = epicFixtures(depsMock);

    const action = channelOpen.success(
      {
        id: channelId,
        settleTimeout,
        isFirstParticipant,
        token,
        txHash,
        txBlock: 125,
        confirmed: true,
      },
      { tokenNetwork, partner },
    );
    const action$ = of<RaidenAction>(action);

    await expect(channelOpenedEpic(action$).toPromise()).resolves.toMatchObject(
      channelMonitor({ id: channelId, fromBlock: 125 }, { tokenNetwork, partner }),
    );
  });

  describe('channelMonitoredEpic', () => {
    const deposit = bigNumberify(1023) as UInt<32>,
      depositEncoded = defaultAbiCoder.encode(['uint256'], [deposit]),
      withdraw = bigNumberify(100) as UInt<32>,
      withdrawEncoded = defaultAbiCoder.encode(['uint256'], [withdraw]),
      openBlock = 121,
      closeBlock = 124,
      settleBlock = closeBlock + settleTimeout + 1,
      settleDataEncoded = defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'uint256', 'bytes32'],
        [Zero, HashZero, Zero, HashZero],
      ),
      delayEnd$ = timer(10).pipe(ignoreElements());

    test('first channelMonitor with past$ own ChannelNewDeposit event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitor({ id: channelId, fromBlock: openBlock }, { tokenNetwork, partner }),
        ),
        // give some time so takeUntil doesn't unsubscribe ahead of time
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

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

      await expect(channelMonitoredEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelDeposit.success(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: deposit,
            txHash: expect.any(String),
            txBlock: 123,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('already channelMonitor with new$ partner ChannelNewDeposit event', async () => {
      const action = channelMonitor({ id: channelId }, { tokenNetwork, partner }),
        curState = [
          tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
          channelOpen.success(
            {
              id: channelId,
              settleTimeout,
              isFirstParticipant,
              token,
              txHash,
              txBlock: openBlock,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

      const promise = channelMonitoredEpic(action$, state$, depsMock).toPromise();

      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: 125,
          filter: tokenNetworkContract.filters.ChannelNewDeposit(channelId, partner, null),
          data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
        }),
      );

      await expect(promise).resolves.toEqual(
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: deposit,
            txHash: expect.any(String),
            txBlock: 125,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test("ensure multiple channelMonitor don't produce duplicated events", async () => {
      const multiple = 16;
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = from(
          range(multiple).map(() => channelMonitor({ id: channelId }, { tokenNetwork, partner })),
        ),
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

      const promise = channelMonitoredEpic(action$, state$, depsMock)
        .pipe(toArray()) // aggregate all emitted values in this period in a single array
        .toPromise();

      // even though multiple channelMonitor events were fired, blockchain fires a single event
      depsMock.provider.emit(
        '*',
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
      expect(result[0]).toEqual(
        channelDeposit.success(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: deposit,
            txHash: expect.any(String),
            txBlock: 125,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );

      expect(depsMock.provider.on).toHaveBeenCalledTimes(1); // mergedFilter
    });

    test('new$ partner ChannelWithdraw event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelDeposit.success(
          {
            id: channelId,
            participant: partner,
            totalDeposit: bigNumberify(410) as UInt<32>,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitor({ id: channelId }, { tokenNetwork, partner }),
        ),
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

      const promise = channelMonitoredEpic(action$, state$, depsMock).toPromise();

      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: closeBlock,
          transactionHash: txHash,
          filter: tokenNetworkContract.filters.ChannelWithdraw(channelId, partner, null),
          data: withdrawEncoded, // non-indexed totalWithdraw
        }),
      );

      await expect(promise).resolves.toEqual(
        channelWithdrawn(
          {
            id: channelId,
            participant: partner,
            totalWithdraw: withdraw,
            txHash,
            txBlock: closeBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('new$ partner ChannelClosed event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitor({ id: channelId }, { tokenNetwork, partner }),
        ),
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

      const promise = channelMonitoredEpic(action$, state$, depsMock).toPromise();

      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: closeBlock,
          transactionHash: txHash,
          filter: tokenNetworkContract.filters.ChannelClosed(channelId, partner, 11, null),
          data: HashZero, // non-indexed balance_hash
        }),
      );

      await expect(promise).resolves.toEqual(
        channelClose.success(
          {
            id: channelId,
            participant: partner,
            txHash,
            txBlock: closeBlock,
            confirmed: undefined,
          },
          { tokenNetwork, partner },
        ),
      );
    });

    test('new$ ChannelSettled event', async () => {
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        channelClose.success(
          {
            id: channelId,
            participant: depsMock.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ), // channel is in "closed" state already
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelMonitor({ id: channelId }, { tokenNetwork, partner }),
        ),
        state$ = concat(of<RaidenState>(curState), delayEnd$);
      getLatest$(action$, state$, depsMock).subscribe((latest) => depsMock.latest$.next(latest));

      expect(depsMock.provider.removeListener).not.toHaveBeenCalled();
      const promise = channelMonitoredEpic(action$, state$, depsMock).toPromise();

      expect(depsMock.provider.listenerCount()).toBe(1);

      depsMock.provider.emit(
        '*',
        makeLog({
          blockNumber: settleBlock,
          transactionHash: txHash,
          filter: tokenNetworkContract.filters.ChannelSettled(channelId, null, null, null, null),
          data: settleDataEncoded, // participants amounts aren't indexed, so they go in data
        }),
      );

      await expect(promise).resolves.toEqual(
        channelSettle.success(
          { id: channelId, txHash, txBlock: settleBlock, confirmed: undefined, locks: [] },
          { tokenNetwork, partner },
        ),
      );

      // ensure ChannelSettledAction completed channel monitoring and unsubscribed from events
      expect(depsMock.provider.removeListener).toHaveBeenCalledTimes(1);
      expect(depsMock.provider.listenerCount()).toBe(0);
    });
  });

  describe('channelDepositEpic', () => {
    const deposit = bigNumberify(1023) as UInt<32>,
      openBlock = 121;

    test('fails if there is no token for tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenAction>(
          channelDeposit.request({ deposit }, { tokenNetwork, partner }),
        ),
        state$ = of<RaidenState>(state);

      await expect(channelDepositEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelDeposit.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('fails if channel.state !== "open"', async () => {
      // there's a channel already opened in state
      const action = channelDeposit.request({ deposit }, { tokenNetwork, partner }),
        // channel is in 'opening' state
        curState = [
          tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
          channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
        ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(action),
        state$ = of<RaidenState>(curState);

      await expect(channelDepositEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelDeposit.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('approve tx fails', async () => {
      expect.assertions(3);
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelDeposit.request({ deposit }, { tokenNetwork, partner }),
        ),
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

      await expect(channelDepositEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelDeposit.failure(expect.any(Error), { tokenNetwork, partner }),
      );
      expect(tokenContract.functions.approve).toHaveBeenCalledTimes(1);
      expect(tokenContract.functions.approve).toHaveBeenCalledWith(tokenNetwork, deposit);
    });

    test('setTotalDeposit tx fails', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelDeposit.request({ deposit }, { tokenNetwork, partner }),
        ),
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

      await expect(channelDepositEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelDeposit.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('success', async () => {
      // there's a channel already opened in state
      const prevDeposit = bigNumberify(330) as UInt<32>;
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        // own initial deposit of 330
        channelDeposit.success(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: prevDeposit,
            txHash,
            txBlock: openBlock + 1,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelDeposit.request({ deposit }, { tokenNetwork, partner }),
        ),
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
      tokenNetworkContract.functions.getChannelParticipantInfo.mockResolvedValueOnce([
        prevDeposit,
        Zero,
        true,
        '',
        Zero,
        '',
        Zero,
      ]);

      // result is undefined on success as the respective channelDeposit.success is emitted by the
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
        deposit.add(prevDeposit),
        partner,
      );
      expect(setTotalDepositTx.wait).toHaveBeenCalledTimes(1);
    });
  });

  describe('channelCloseEpic', () => {
    let depsMock: ReturnType<typeof raidenEpicDeps>;
    let token: ReturnType<typeof epicFixtures>['token'],
      tokenNetworkContract: ReturnType<typeof epicFixtures>['tokenNetworkContract'],
      tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
      channelId: ReturnType<typeof epicFixtures>['channelId'],
      partner: ReturnType<typeof epicFixtures>['partner'],
      partnerSigner: ReturnType<typeof epicFixtures>['partnerSigner'],
      settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
      isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
      txHash: ReturnType<typeof epicFixtures>['txHash'],
      action$: ReturnType<typeof epicFixtures>['action$'],
      state$: ReturnType<typeof epicFixtures>['state$'];
    const openBlock = 121;
    const closeBlock = 125;

    beforeEach(async () => {
      depsMock = raidenEpicDeps();
      ({
        token,
        tokenNetworkContract,
        tokenNetwork,
        channelId,
        partner,
        partnerSigner,
        settleTimeout,
        isFirstParticipant,
        txHash,
        action$,
        state$,
      } = epicFixtures(depsMock));

      [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
      ].forEach((a) => action$.next(a));

      // put a received & unlocked transfer from partner in state
      const { state, config } = await depsMock.latest$.pipe(first()).toPromise();
      const secret = makeSecret();
      const secrethash = getSecrethash(secret);
      const amount = bigNumberify(10) as UInt<32>;
      const direction = Direction.RECEIVED;
      const expiration = bigNumberify(state.blockNumber + config.revealTimeout * 2) as UInt<32>;
      const lock = {
        secrethash,
        amount,
        expiration,
      };
      const transf = await signMessage(
        partnerSigner,
        {
          type: MessageType.LOCKED_TRANSFER,
          payment_identifier: makePaymentId(),
          message_identifier: makeMessageId(),
          chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
          token,
          token_network_address: tokenNetwork,
          recipient: depsMock.address,
          target: depsMock.address,
          initiator: partner,
          channel_identifier: bigNumberify(channelId) as UInt<32>,
          metadata: { routes: [{ route: [depsMock.address] }] },
          lock,
          locksroot: getLocksroot([lock]),
          nonce: One as UInt<8>,
          transferred_amount: Zero as UInt<32>,
          locked_amount: lock.amount,
        },
        depsMock,
      );

      const unlock = await signMessage(
        partnerSigner,
        {
          type: MessageType.UNLOCK,
          payment_identifier: transf.payment_identifier,
          message_identifier: makeMessageId(),
          chain_id: transf.chain_id,
          token_network_address: tokenNetwork,
          channel_identifier: transf.channel_identifier,
          nonce: transf.nonce.add(1) as UInt<8>,
          transferred_amount: transf.transferred_amount.add(amount) as UInt<32>,
          locked_amount: transf.locked_amount.sub(amount) as UInt<32>,
          locksroot: getLocksroot([]),
          secret,
        },
        depsMock,
      );

      [
        transferSigned(
          {
            message: transf,
            fee: Zero as Int<32>,
          },
          { secrethash, direction },
        ),
        transferUnlock.success({ message: unlock }, { secrethash, direction }),
      ].forEach((a) => action$.next(a));
    });

    afterEach(() => {
      jest.clearAllMocks();
      action$.complete();
      state$.complete();
      depsMock.latest$.complete();
    });

    test('fails if there is no open channel with partner on tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenAction>(channelClose.request(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(state);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelClose.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('fails if channel.state !== "open"|"closing"', async () => {
      // there's a channel already opened in state
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        // channel is in 'opening' state
        channelOpen.request({ settleTimeout }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(channelClose.request(undefined, { tokenNetwork, partner })),
        state$ = of<RaidenState>(curState);

      await expect(channelCloseEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelClose.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('closeChannel tx fails', async () => {
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

      const promise = channelCloseEpic(action$, state$, depsMock).toPromise();
      action$.next(channelClose.request(undefined, { tokenNetwork, partner }));
      action$.complete();

      await expect(promise).resolves.toEqual(
        channelClose.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('success', async () => {
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

      const promise = channelCloseEpic(action$, state$, depsMock).toPromise();
      action$.next(channelClose.request(undefined, { tokenNetwork, partner }));
      action$.complete();

      // result is undefined on success as the respective channelClose.success is emitted by the
      // channelMonitoredEpic, which monitors the blockchain for channel events
      await expect(promise).resolves.toBeUndefined();
      expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledTimes(1);
      expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledWith(
        channelId,
        partner,
        depsMock.address,
        expect.any(String), // balance_hash
        expect.any(BigNumber), // nonce
        expect.any(String), // additional_hash
        expect.any(String), // non_closing_signature
        expect.any(String), // closing_signature
      );
      expect(closeTx.wait).toHaveBeenCalledTimes(1);
    });

    test('channelUpdateEpic', async () => {
      const promise = channelUpdateEpic(action$, state$, depsMock).toPromise();
      [
        channelClose.success(
          {
            id: channelId,
            participant: partner,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock + 1 }),
        newBlock({ blockNumber: closeBlock + 2 }),
      ].forEach((a) => action$.next(a));

      setTimeout(() => action$.complete(), 10);
      await expect(promise).resolves.toBeUndefined();

      expect(tokenNetworkContract.functions.updateNonClosingBalanceProof).toHaveBeenCalledTimes(1);
    });
  });

  describe('channelSettleEpic', () => {
    const openBlock = 121,
      closeBlock = 125,
      settleBlock = closeBlock + settleTimeout + 1;

    test('fails if there is no channel with partner on tokenNetwork', async () => {
      // there's a channel already opened in state
      const action$ = of<RaidenAction>(
          channelSettle.request(undefined, { tokenNetwork, partner }),
        ),
        state$ = of<RaidenState>(state);

      await expect(channelSettleEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelSettle.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('fails if channel.state !== "settleable|settling"', async () => {
      // there's a channel in closed state, but not yet settleable
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClose.success(
          {
            id: channelId,
            participant: depsMock.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelSettle.request(undefined, { tokenNetwork, partner }),
        ),
        state$ = of<RaidenState>(curState);

      await expect(channelSettleEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelSettle.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('settleChannel tx fails', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClose.success(
          {
            id: channelId,
            participant: depsMock.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelSettle.request(undefined, { tokenNetwork, partner }),
        ),
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

      await expect(channelSettleEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
        channelSettle.failure(expect.any(Error), { tokenNetwork, partner }),
      );
    });

    test('success', async () => {
      // there's a channel with partner in closed state and current block >= settleBlock
      const curState = [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        channelOpen.success(
          {
            id: channelId,
            settleTimeout,
            isFirstParticipant,
            token,
            txHash,
            txBlock: openBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: closeBlock }),
        channelClose.success(
          {
            id: channelId,
            participant: depsMock.address,
            txHash,
            txBlock: closeBlock,
            confirmed: true,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: settleBlock }),
        channelSettleable({ settleableBlock: settleBlock }, { tokenNetwork, partner }),
      ].reduce(raidenReducer, state);
      const action$ = of<RaidenAction>(
          channelSettle.request(undefined, { tokenNetwork, partner }),
        ),
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
        Zero, // self transfered amount
        Zero, // self locked amount
        HashZero, // self locksroot
        partner,
        Zero, // partner transfered amount
        Zero, // partner locked amount
        HashZero, // partner locksroot
      );
      expect(settleTx.wait).toHaveBeenCalledTimes(1);
    });
  });

  test('channelUnlockEpic', async () => {
    expect.assertions(4);
    const tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork);

    tokenNetworkContract.functions.unlock.mockResolvedValueOnce({
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
    });

    await expect(
      channelUnlockEpic(
        of(
          channelSettle.success(
            {
              id: channelId,
              txHash,
              txBlock: 129,
              confirmed: true,
              locks: [
                {
                  amount: bigNumberify(10) as UInt<32>,
                  expiration: bigNumberify(128) as UInt<32>,
                  secrethash: getSecrethash(makeSecret()),
                },
              ],
            },
            { tokenNetwork, partner },
          ),
        ),
        depsMock.latest$.pipe(pluck('state')),
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    tokenNetworkContract.functions.unlock.mockResolvedValueOnce({
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
    });

    await expect(
      channelUnlockEpic(
        of(
          channelSettle.success(
            {
              id: channelId,
              txHash,
              txBlock: 129,
              confirmed: true,
              locks: [
                {
                  amount: bigNumberify(10) as UInt<32>,
                  expiration: bigNumberify(128) as UInt<32>,
                  secrethash: getSecrethash(makeSecret()),
                },
              ],
            },
            { tokenNetwork, partner },
          ),
        ),
        depsMock.latest$.pipe(pluck('state')),
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledTimes(2);
    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledWith(
      channelId,
      depsMock.address,
      partner,
      expect.any(Uint8Array),
    );
  });
});
