/* eslint-disable @typescript-eslint/camelcase */
import { of, BehaviorSubject, EMPTY, timer } from 'rxjs';
import { first, takeUntil } from 'rxjs/operators';
import { bigNumberify, defaultAbiCoder } from 'ethers/utils';
import { Zero, AddressZero, One } from 'ethers/constants';
import { getType } from 'typesafe-actions';

import { UInt, Int, Address } from 'raiden-ts/utils/types';
import {
  newBlock,
  tokenMonitored,
  channelOpened,
  channelDeposited,
  channelClosed,
} from 'raiden-ts/channels/actions';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import { matrixPresenceUpdate } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import {
  pathFindServiceEpic,
  pfsCapacityUpdateEpic,
  pfsServiceRegistryMonitorEpic,
} from 'raiden-ts/path/epics';
import { pathFound, pathFind, pathFindFailed, pfsListUpdated } from 'raiden-ts/path/actions';
import { RaidenState } from 'raiden-ts/state';
import { messageGlobalSend } from 'raiden-ts/messages/actions';
import { MessageType } from 'raiden-ts/messages/types';
import { losslessStringify } from 'raiden-ts/utils/data';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps, makeLog } from '../mocks';

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
    pfsAddress,
    pfsTokenAddress,
    pfsInfoResponse,
  } = epicFixtures(depsMock);

  const openBlock = 121,
    state$ = depsMock.stateOutput$;

  const result = { result: [{ path: [partner, target], estimated_fee: 1234 }] },
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
            totalDeposit: bigNumberify(50000000) as UInt<32>,
            txHash,
          },
          { tokenNetwork, partner },
        ),
        newBlock({ blockNumber: 126 }),
      ].reduce(raidenReducer, state),
    );
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
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('unknown tokenNetwork') }),
        { tokenNetwork: token, target, value },
      ),
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
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringMatching(/target.*not online/i) }),
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success provided route', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind(
          { paths: [{ path: [depsMock.address, partner, target], fee }] },
          { tokenNetwork, target, value },
        ),
      );

    // self should be taken out of route
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound({ paths: [{ path: [partner, target], fee }] }, { tokenNetwork, target, value }),
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
        { paths: [{ path: [partner], fee: Zero as Int<32> }] },
        { tokenNetwork, target: partner, value },
      ),
    );
  });

  test('success request pfs from action', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind(
          {
            pfs: {
              address: pfsAddress,
              url: depsMock.config$.value.pfs!,
              rtt: 3,
              price: One as UInt<32>,
              token: pfsTokenAddress,
            },
          },
          { tokenNetwork, target, value },
        ),
      );

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

    const { pfsSafetyMargin } = depsMock.config$.value;
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        {
          paths: [
            {
              path: [partner, target],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success request pfs from config', async () => {
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
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

    const { pfsSafetyMargin } = depsMock.config$.value;
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        {
          paths: [
            {
              path: [partner, target],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success request pfs from pfsList', async () => {
    expect.assertions(4);
    // put config.pfs into auto mode
    state$.next(raidenReducer(state$.value, raidenConfigUpdate({ config: { pfs: undefined } })));

    const value = bigNumberify(100) as UInt<32>,
      pfsAddress1 = '0x0800000000000000000000000000000000000091' as Address,
      pfsAddress2 = '0x0800000000000000000000000000000000000092' as Address,
      pfsAddress3 = '0x0800000000000000000000000000000000000093' as Address,
      pfsAddress4 = '0x0800000000000000000000000000000000000094' as Address,
      pfsAddress5 = '0x0800000000000000000000000000000000000095' as Address,
      action$ = of(
        pfsListUpdated({
          pfsList: [pfsAddress1, pfsAddress2, pfsAddress3, pfsAddress4, pfsAddress5, pfsAddress],
        }),
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    // pfsAddress1&2 urls call will fail
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('');
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('http://not.https.url');
    // pfsAddress3 will be accepted with default https:// schema
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('domain.only.url');

    const pfsInfoResponse3 = { ...pfsInfoResponse, payment_address: pfsAddress3 };
    fetch.mockImplementationOnce(
      async () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                json: jest.fn(async () => pfsInfoResponse3),
                text: jest.fn(async () => losslessStringify(pfsInfoResponse3)),
              }),
            23, // higher rtt for this PFS
          ),
        ),
    );

    // 4 & 5, test sorting by price info
    const pfsInfoResponse4 = { ...pfsInfoResponse, payment_address: pfsAddress4, price_info: 5 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse4),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse4)),
    });

    const pfsInfoResponse5 = { ...pfsInfoResponse, payment_address: pfsAddress5, price_info: 10 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse5),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse5)),
    });

    // pfsAddress succeeds main response
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

    const { pfsSafetyMargin } = depsMock.config$.value;
    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFound(
        {
          paths: [
            {
              path: [partner, target],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        { tokenNetwork, target, value },
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(4 + 1); // 3,4,5,0 addresses, + paths for chosen one
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/domain.only.url\/.*\/info/),
      expect.anything(),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/^https:\/\/.*\/paths$/),
      expect.anything(),
    );
  });

  test('fail request pfs from pfsList, empty', async () => {
    expect.assertions(1);
    // put config.pfs into auto mode
    state$.next(raidenReducer(state$.value, raidenConfigUpdate({ config: { pfs: undefined } })));

    const value = bigNumberify(100) as UInt<32>,
      action$ = of(
        pfsListUpdated({
          pfsList: [pfsAddress],
        }),
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind({}, { tokenNetwork, target, value }),
      );

    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('not_a_url');

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({
          message: expect.stringContaining('Could not validate any PFS info'),
        }),
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
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({ error_code: 1337, errors: 'No route' })),
      text: jest.fn(async () => '{ "error_code": 1337, "errors": "No route" }'),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('paths request: code=404') }),
        { tokenNetwork, target, value },
      ),
    );
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
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

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
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('Invalid value') }),
        {
          tokenNetwork,
          target,
          value,
        },
      ),
    );
  });

  test('success from config but filter out invalid pfs result routes', async () => {
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
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

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
        { paths: [{ path: [partner, target], fee: bigNumberify(1) as Int<32> }] },
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

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {}),
      text: jest.fn(async () => losslessStringify({})),
    });

    const result = { result: [{ path: [partner, target], estimated_fee: 1 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => losslessStringify(result)),
    });

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('no valid routes found') }),
        {
          tokenNetwork,
          target,
          value,
        },
      ),
    );
  });

  test('fail provided route but not enough capacity', async () => {
    expect.assertions(1);

    const value = bigNumberify(80000000) as UInt<32>,
      action$ = of(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        matrixPresenceUpdate({ userId: targetUserId, available: true }, { address: target }),
        pathFind(
          { paths: [{ path: [depsMock.address, partner, target], fee }] },
          { tokenNetwork, target, value },
        ),
      );

    await expect(
      pathFindServiceEpic(action$, state$, depsMock).toPromise(),
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('no valid routes found') }),
        { tokenNetwork, target, value },
      ),
    );
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
    ).resolves.toMatchObject(
      pathFindFailed(
        expect.objectContaining({ message: expect.stringContaining('PFS disabled') }),
        { tokenNetwork, target, value },
      ),
    );
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

describe('PFS: pfsServiceRegistryMonitorEpic', () => {
  const depsMock = raidenEpicDeps(),
    { state, pfsAddress } = epicFixtures(depsMock),
    state$ = depsMock.stateOutput$;

  beforeEach(() => {
    state$.next(state); // reset state
  });

  test('success', async () => {
    expect.assertions(2);

    // enable config.pfs auto (undefined)
    state$.next(raidenReducer(state$.value, raidenConfigUpdate({ config: { pfs: undefined } })));

    const validTill = bigNumberify(Math.floor(Date.now() / 1000) + 86400), // tomorrow
      registeredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [validTill, Zero, AddressZero],
      ),
      expiredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [bigNumberify(Math.floor(Date.now() / 1000) - 86400), Zero, AddressZero],
      ),
      expiringSoonEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [bigNumberify(Math.floor(Date.now() / 1000) + 1), Zero, AddressZero],
      );

    expect(depsMock.config$.value.pfs).toBeUndefined();
    const promise = pfsServiceRegistryMonitorEpic(EMPTY, state$, depsMock)
      .pipe(first())
      .toPromise();

    // expired
    depsMock.provider.emit(
      depsMock.serviceRegistryContract.filters.RegisteredService(null, null, null, null),
      makeLog({
        blockNumber: 115,
        filter: depsMock.serviceRegistryContract.filters.RegisteredService(
          pfsAddress,
          null,
          null,
          null,
        ),
        data: expiredEncoded,
      }),
    );

    // new event from previous expired service, but now valid=true
    depsMock.provider.emit(
      depsMock.serviceRegistryContract.filters.RegisteredService(null, null, null, null),
      makeLog({
        blockNumber: 116,
        filter: depsMock.serviceRegistryContract.filters.RegisteredService(
          pfsAddress,
          null,
          null,
          null,
        ),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );

    // duplicated event, but valid
    depsMock.provider.emit(
      depsMock.serviceRegistryContract.filters.RegisteredService(null, null, null, null),
      makeLog({
        blockNumber: 116,
        filter: depsMock.serviceRegistryContract.filters.RegisteredService(
          pfsAddress,
          null,
          null,
          null,
        ),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );

    // expires while waiting, doesn't make it to the list
    depsMock.provider.emit(
      depsMock.serviceRegistryContract.filters.RegisteredService(null, null, null, null),
      makeLog({
        blockNumber: 117,
        filter: depsMock.serviceRegistryContract.filters.RegisteredService(
          '0x0700000000000000000000000000000000000006',
          null,
          null,
          null,
        ),
        data: expiringSoonEncoded,
      }),
    );

    await expect(promise).resolves.toMatchObject({
      type: getType(pfsListUpdated),
      payload: { pfsList: [pfsAddress] },
    });
  });

  test('noop if config.pfs is set', async () => {
    expect.assertions(2);
    expect(depsMock.config$.value.pfs).toBeDefined();

    const validTill = bigNumberify(Math.floor(Date.now() / 1000) + 86400), // tomorrow
      registeredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [validTill, Zero, AddressZero],
      );

    const promise = pfsServiceRegistryMonitorEpic(EMPTY, state$, depsMock)
      .pipe(takeUntil(timer(1500)))
      .toPromise();

    depsMock.provider.emit(
      depsMock.serviceRegistryContract.filters.RegisteredService(null, null, null, null),
      makeLog({
        blockNumber: 116,
        filter: depsMock.serviceRegistryContract.filters.RegisteredService(
          pfsAddress,
          null,
          null,
          null,
        ),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );

    await expect(promise).resolves.toBeUndefined();
  });
});
