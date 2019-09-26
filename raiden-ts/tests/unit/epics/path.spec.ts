/* eslint-disable @typescript-eslint/camelcase */
import { of, BehaviorSubject } from 'rxjs';
import { bigNumberify } from 'ethers/utils';

import { UInt, Address } from 'raiden-ts/utils/types';
import {
  newBlock,
  tokenMonitored,
  channelOpened,
  channelDeposited,
  channelClosed,
} from 'raiden-ts/channels/actions';
import { matrixPresenceUpdate } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { pathFindServiceEpic } from 'raiden-ts/path/epics';
import { pathFound, pathFind, pathFindFailed } from 'raiden-ts/path/actions';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';

describe('PFS: pathFindServiceEpic', () => {
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
    matrixServer,
    partnerUserId,
  } = epicFixtures(depsMock);

  const target = '0x0100000000000000000000000000000000000005' as Address,
    targetUserId = `@${partner.toLowerCase()}:${matrixServer}`,
    openBlock = 121,
    state$ = new BehaviorSubject(state);

  const fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async () => ({ result: [{ path: [partner, target], estimated_fee: 0 }] } as any),
    ),
    text: jest.fn(async () => ''),
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
          { metadata: { routes: [{ route: [depsMock.address, partner, target] }] } },
          { tokenNetwork, target, value },
        ),
      );

    // self should be taken out of route
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        { metadata: { routes: [{ route: [partner, target] }] } },
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
        { metadata: { routes: [{ route: [partner] }] } },
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
        { metadata: { routes: [{ route: [partner, target] }] } },
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

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        // expected 'result', not 'paths'
        paths: [{ path: [partner, target], estimated_fee: 0 }],
      })),
      text: jest.fn(async () => ''),
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

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        result: [
          // token isn't a valid channel, should be removed from output
          { path: [token, target], estimated_fee: 0 },
          // another route going through token, also should be removed
          { path: [token, partner, target], estimated_fee: 0 },
          { path: [partner, target], estimated_fee: 1 },
          // another "valid" route through partner
          { path: [partner, token, target], estimated_fee: 2 },
          // another invalid route, but we already selected partner first
          { path: [tokenNetwork, target], estimated_fee: 3 },
        ],
      })),
      text: jest.fn(async () => ''),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        {
          metadata: {
            routes: [{ route: [partner, target] }, { route: [partner, token, target] }],
          },
        },
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
          { metadata: { routes: [{ route: [depsMock.address, partner, target] }] } },
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
