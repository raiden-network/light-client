/* eslint-disable @typescript-eslint/camelcase */
import { of, BehaviorSubject } from 'rxjs';
import { bigNumberify } from 'ethers/utils';

import { UInt, Int } from 'raiden-ts/utils/types';
import {
  newBlock,
  tokenMonitored,
  channelOpened,
  channelDeposited,
  channelClosed,
} from 'raiden-ts/channels/actions';
import { matrixPresenceUpdate } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { pathFindServiceEpic, pfsCapacityUpdateEpic } from 'raiden-ts/path/epics';
import { pathFound, pathFind, pathFindFailed } from 'raiden-ts/path/actions';
import { RaidenState } from 'raiden-ts/state';
import { messageGlobalSend } from 'raiden-ts/messages/actions';
import { MessageType } from 'raiden-ts/messages/types';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';
import { Zero } from 'ethers/constants';
import { losslessStringify } from 'raiden-ts/utils/data';

describe('PFS: pathFindServiceEpic', () => {
  const depsMock = raidenEpicDeps();
  const {
    token,
    tokenNetwork,
    channelId,
    partner,
    target,
    settleTimeout,
    isFirstParticipant,
    txHash,
    state,
    partnerUserId,
    targetUserId,
    fee,
  } = epicFixtures(depsMock);

  const openBlock = 121,
    state$ = new BehaviorSubject(state);

  const result = { result: [{ path: [partner, target], estimated_fee: 3 }] },
    fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: jest.fn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => result as any,
      ),
      text: jest.fn(async () => losslessStringify(result)),
    }));
  Object.assign(global, { fetch });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // state$ contains a channel opened & deposited with partner
    state$.next(
      [
        tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
        // a couple of channels with unrelated partners, with larger deposits
        channelOpened(
          { id: channelId, settleTimeout, openBlock, isFirstParticipant, txHash },
          { tokenNetwork, partner },
        ),
        channelDeposited(
          {
            id: channelId,
            participant: depsMock.address,
            totalDeposit: bigNumberify(500) as UInt<32>,
            txHash,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: 126 }),
      ].reduce(raidenReducer, state),
    );
    // enable pfs in config
    depsMock.config$.next({
      ...depsMock.config$.value,
      pfs: 'http://my.pfs.raiden.local',
    });
  });

  test('fail unknown tokenNetwork', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork: token, target, value }),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFindFailed(expect.any(Error), { tokenNetwork: token, target, value }),
    );
  });

  test('fail target not available', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: false }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });

  test('success provided route', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind(
          { paths: { paths: [{ path: [depsMock.address, partner, target], fee }] } },
          { tokenNetwork, target, value },
        ),
      );

    // self should be taken out of route
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        { paths: { paths: [{ path: [partner, target], fee }] } },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success direct route', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target: partner, value }),
      );

    // self should be taken out of route
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        { paths: { paths: [{ path: [partner], fee: Zero as Int<32> }] } },
        { tokenNetwork, target: partner, value },
      ),
    );
  });

  test('success pfs request', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        { paths: { paths: [{ path: [partner, target], fee }] } },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail pfs request error', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({ error_code: 1337, errors: 'No route' })),
      text: jest.fn(async () => '{ "error_code": 1337, "errors": "No route" }'),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });

  test('fail pfs return success but invalid response format', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    // expected 'result', not 'paths'
    const paths = { paths: [{ path: [partner, target], estimated_fee: 0 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => paths),
      text: jest.fn(async () => losslessStringify(paths)),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });

  test('success but filter out invalid pfs result routes', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    const result = {
      result: [
        // token isn't a valid channel, should be removed from output
        { path: [token, target], estimated_fee: 0 },
        // another route going through token, also should be removed
        { path: [token, partner, target], estimated_fee: 0 },
        // valid route
        { path: [partner, target], estimated_fee: 1 },
        // another "valid" route through partner, filtered out because different fee
        { path: [partner, token, target], estimated_fee: 2 },
        // another invalid route, but we already selected partner first
        { path: [tokenNetwork, target], estimated_fee: 3 },
      ],
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => losslessStringify(result)),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        { paths: { paths: [{ path: [partner, target], fee: bigNumberify(1) as Int<32> }] } },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail channel not open', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    state$.next(
      [
        channelClosed(
          { id: channelId, participant: partner, closeBlock: 126, txHash },
          { tokenNetwork, partner },
        ),
      ].reduce(raidenReducer, state$.value),
    );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });

  test('fail provided route but not enough capacity', async () => {
    expect.assertions(1);

    const value = bigNumberify(800) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind(
          { paths: { paths: [{ path: [depsMock.address, partner, target], fee }] } },
          { tokenNetwork, target, value },
        ),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });

  test('fail pfs disabled', async () => {
    expect.assertions(1);

    // disable pfs
    depsMock.config$.next({
      ...depsMock.config$.value,
      pfs: null,
    });

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(pathFindFailed(expect.any(Error), { tokenNetwork, target, value }));
  });
});

describe('PFS: pfsCapacityUpdateEpic', () => {
  const depsMock = raidenEpicDeps();
  const {
    token,
    tokenNetwork,
    channelId,
    partner,
    settleTimeout,
    isFirstParticipant,
    txHash,
    state,
  } = epicFixtures(depsMock);

  const openBlock = 121;
  let openedState: RaidenState;

  /**
   * this will leave/reset transferingState, signedTransfer as a state with a channel and pending
   * transfer
   */
  beforeEach(async () => {
    openedState = [
      tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
      channelOpened(
        { id: channelId, settleTimeout, openBlock, isFirstParticipant, txHash },
        { tokenNetwork, partner },
      ),
      newBlock({ blockNumber: 125 }),
    ].reduce(raidenReducer, state);
  });

  test('own channelDeposited triggers capacity update', async () => {
    expect.assertions(1);

    const deposit = bigNumberify(500) as UInt<32>,
      action = channelDeposited(
        {
          id: channelId,
          participant: depsMock.address,
          totalDeposit: deposit,
          txHash,
        },
        { tokenNetwork, partner },
      ),
      action$ = of(action),
      state$ = new BehaviorSubject<RaidenState>([action].reduce(raidenReducer, openedState));

    await expect(pfsCapacityUpdateEpic(action$, state$, depsMock).toPromise()).resolves.toEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_CAPACITY_UPDATE,
            updating_participant: depsMock.address,
            other_participant: partner,
            updating_capacity: deposit,
            signature: expect.any(String),
          }),
        },
        { roomName: expect.stringMatching(depsMock.config$.value.pfsRoom!) },
      ),
    );
  });

  test("signature fail isn't fatal", async () => {
    expect.assertions(2);

    const deposit = bigNumberify(500) as UInt<32>,
      action = channelDeposited(
        {
          id: channelId,
          participant: depsMock.address,
          totalDeposit: deposit,
          txHash,
        },
        { tokenNetwork, partner },
      ),
      action$ = of(action),
      state$ = new BehaviorSubject<RaidenState>([action].reduce(raidenReducer, openedState));

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
    signerSpy.mockRejectedValueOnce(new Error('Signature rejected'));

    await expect(
      pfsCapacityUpdateEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toBeUndefined();

    expect(signerSpy).toHaveBeenCalledTimes(1);
    signerSpy.mockRestore();
  });
});
