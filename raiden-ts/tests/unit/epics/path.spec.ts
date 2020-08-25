import {
  raidenEpicDeps,
  makeLog,
  makeRaidens,
  makeRaiden,
  providersEmit,
  makeAddress,
  waitBlock,
  sleep,
  MockedRaiden,
  makePfsInfoResponse,
  makeIou,
} from '../mocks';
import {
  id,
  token,
  tokenNetwork,
  amount,
  openBlock,
  epicFixtures,
  ensureChannelIsOpen,
  ensureChannelIsDeposited,
  deposit,
  pfsAddress,
  pfsTokenAddress,
  fee,
  ensureTransferUnlocked,
  ensureTransferPending,
  ensureChannelIsClosed,
} from '../fixtures';

import { Observable } from 'rxjs';
import { first, toArray, pluck } from 'rxjs/operators';
import { bigNumberify, defaultAbiCoder } from 'ethers/utils';
import { Zero, AddressZero, One } from 'ethers/constants';
import { UInt, Int, Address, Signature, isntNil } from 'raiden-ts/utils/types';
import {
  newBlock,
  tokenMonitored,
  channelOpen,
  channelDeposit,
  channelClose,
  channelMonitored,
} from 'raiden-ts/channels/actions';
import { raidenConfigUpdate, raidenShutdown, RaidenAction } from 'raiden-ts/actions';
import { matrixPresence } from 'raiden-ts/transport/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { pathFindServiceEpic, pfsFeeUpdateEpic } from 'raiden-ts/services/epics';
import { pathFind, pfsListUpdated, iouPersist, iouClear } from 'raiden-ts/services/actions';
import { messageGlobalSend } from 'raiden-ts/messages/actions';
import { MessageType } from 'raiden-ts/messages/types';
import { jsonStringify } from 'raiden-ts/utils/data';
import { pluckDistinct } from 'raiden-ts/utils/rx';
import { ErrorCodes } from 'raiden-ts/utils/error';
import { RaidenState } from 'raiden-ts/state';
import { Capabilities } from 'raiden-ts/constants';
import { signIOU } from 'raiden-ts/services/utils';
import { getLatest$ } from 'raiden-ts/epics';

describe('PFS: pathFindServiceEpic', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>,
    token: ReturnType<typeof epicFixtures>['token'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    target: ReturnType<typeof epicFixtures>['target'],
    settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
    isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
    txHash: ReturnType<typeof epicFixtures>['txHash'],
    partnerUserId: ReturnType<typeof epicFixtures>['partnerUserId'],
    targetUserId: ReturnType<typeof epicFixtures>['targetUserId'],
    fee: ReturnType<typeof epicFixtures>['fee'],
    pfsAddress: ReturnType<typeof epicFixtures>['pfsAddress'],
    pfsTokenAddress: ReturnType<typeof epicFixtures>['pfsTokenAddress'],
    pfsInfoResponse: ReturnType<typeof epicFixtures>['pfsInfoResponse'],
    iou: ReturnType<typeof epicFixtures>['iou'],
    action$: ReturnType<typeof epicFixtures>['action$'],
    state$: ReturnType<typeof epicFixtures>['state$'];

  const openBlock = 121;

  const fetch = jest.fn();
  Object.assign(globalThis, { fetch });

  beforeEach(() => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetwork,
      channelId,
      partner,
      target,
      settleTimeout,
      isFirstParticipant,
      txHash,
      partnerUserId,
      targetUserId,
      fee,
      pfsAddress,
      pfsTokenAddress,
      pfsInfoResponse,
      iou,
      action$,
      state$,
    } = epicFixtures(depsMock));

    // state$ contains a channel opened & deposited with partner
    [
      raidenConfigUpdate({ httpTimeout: 30 }),
      tokenMonitored({ token, tokenNetwork, fromBlock: 1 }),
      // a couple of channels with unrelated partners, with larger deposits
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
          participant: depsMock.address,
          totalDeposit: bigNumberify(50000000) as UInt<32>,
          txHash,
          txBlock: openBlock + 1,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
      newBlock({ blockNumber: 126 }),
    ].forEach((a) => action$.next(a));

    const result = { result: [{ path: [partner, target], estimated_fee: 1234 }] };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => result,
      ),
      text: jest.fn(async () => jsonStringify(result)),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    fetch.mockRestore();
    action$.complete();
    state$.complete();
    depsMock.latest$.complete();
  });

  test('fail unknown tokenNetwork', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork: token, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK,
          details: { tokenNetwork: token },
        }),
        { tokenNetwork: token, target, value },
      ),
    );
  });

  test('fail target not available', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: false, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target },
        }),
        {
          tokenNetwork,
          target,
          value,
        },
      ),
    );
  });

  test('fail on failing matrix presence request', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;
    const matrixError = new Error('Unspecific matrix error for testing purpose');
    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      pathFind.request({}, { tokenNetwork, target: partner, value }),
      matrixPresence.failure(matrixError, { address: partner }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      matrixPresence.request(undefined, { address: partner }),
      pathFind.failure(matrixError, {
        tokenNetwork,
        target: partner,
        value,
      }),
    ]);
  });

  test('fail on successful matrix presence request but target unavailable', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;
    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      pathFind.request({}, { tokenNetwork, target: partner, value }),
      matrixPresence.success(
        { userId: partnerUserId, available: false, ts: Date.now() },
        { address: partner },
      ),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      matrixPresence.request(undefined, { address: partner }),
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target: partner },
        }),
        {
          tokenNetwork,
          target: partner,
          value,
        },
      ),
    ]);
  });

  test('success on successful matrix presence request and target available', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;
    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      pathFind.request({}, { tokenNetwork, target: partner, value }),
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      matrixPresence.request(undefined, { address: partner }),
      pathFind.success(
        { paths: [{ path: [partner], fee: Zero as Int<32> }] },
        { tokenNetwork, target: partner, value },
      ),
    ]);
  });

  test('success provided route', async () => {
    expect.assertions(1);

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    const value = bigNumberify(100) as UInt<32>;
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request(
        { paths: [{ path: [depsMock.address, partner, target], fee }] },
        { tokenNetwork, target, value },
      ),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    // self should be taken out of route
    await expect(promise).resolves.toMatchObject(
      pathFind.success(
        { paths: [{ path: [partner, target], fee }] },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success direct route', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target: partner, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    // self should be taken out of route
    await expect(promise).resolves.toMatchObject(
      pathFind.success(
        { paths: [{ path: [partner], fee: Zero as Int<32> }] },
        { tokenNetwork, target: partner, value },
      ),
    );
  });

  test('success request pfs from action', async () => {
    expect.assertions(1);
    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    const pfsSafetyMargin = await depsMock.config$
      .pipe(pluck('pfsSafetyMargin'), first(isntNil))
      .toPromise();
    const pfsUrl = await depsMock.config$.pipe(pluck('pfs'), first(isntNil)).toPromise();

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request(
        {
          pfs: {
            address: pfsAddress,
            url: pfsUrl,
            rtt: 3,
            price: One as UInt<32>,
            token: pfsTokenAddress,
          },
        },
        { tokenNetwork, target, value },
      ),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.success(
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

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    let pfsSafetyMargin!: number;
    depsMock.config$
      .pipe(first())
      .subscribe((config) => (pfsSafetyMargin = config.pfsSafetyMargin));

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.success(
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

    const value = bigNumberify(100) as UInt<32>,
      pfsAddress1 = '0x0800000000000000000000000000000000000091' as Address,
      pfsAddress2 = '0x0800000000000000000000000000000000000092' as Address,
      pfsAddress3 = '0x0800000000000000000000000000000000000093' as Address;

    // put config.pfs into auto mode
    action$.next(raidenConfigUpdate({ pfs: '' }));

    // pfsAddress1 will be accepted with default https:// schema
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('domain.only.url');

    const pfsInfoResponse1 = { ...pfsInfoResponse, payment_address: pfsAddress1 };
    fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                json: jest.fn(async () => pfsInfoResponse1),
                text: jest.fn(async () => jsonStringify(pfsInfoResponse1)),
              }),
            23, // higher rtt for this PFS
          ),
        ),
    );

    // 2 & 3, test sorting by price info
    const pfsInfoResponse2 = { ...pfsInfoResponse, payment_address: pfsAddress2, price_info: 5 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse2),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse2)),
    });

    const pfsInfoResponse3 = { ...pfsInfoResponse, payment_address: pfsAddress3, price_info: 10 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse3),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse3)),
    });

    // pfsAddress succeeds main response
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    let pfsSafetyMargin!: number;
    depsMock.config$
      .pipe(first())
      .subscribe((config) => (pfsSafetyMargin = config.pfsSafetyMargin));

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      pfsListUpdated({
        pfsList: [pfsAddress1, pfsAddress2, pfsAddress3, pfsAddress],
      }),
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toMatchObject([
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(2),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
      pathFind.success(
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
    ]);
    expect(fetch).toHaveBeenCalledTimes(4 + 1 + 1); // 1,2,3,0 addresses, + last iou + paths for chosen one
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
    action$.next(raidenConfigUpdate({ pfs: '' }));

    const value = bigNumberify(100) as UInt<32>;

    // invalid url
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('""');
    // empty url
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('');
    // invalid schema
    depsMock.serviceRegistryContract.functions.urls.mockResolvedValueOnce('http://not.https.url');

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      pfsListUpdated({
        pfsList: [pfsAddress, pfsAddress, pfsAddress],
      }),
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_INVALID_INFO,
        }),
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail pfs request error', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({ error_code: 1337, errors: 'No route' })),
      text: jest.fn(async () => '{ "error_code": 1337, "errors": "No route" }'),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_ERROR_RESPONSE,
          details: { errorCode: 1337, errors: 'No route' },
        }),
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail pfs return success but invalid response format', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    // expected 'result', not 'paths'
    const paths = { paths: [{ path: [partner, target], estimated_fee: 0 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => paths),
      text: jest.fn(async () => jsonStringify(paths)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        expect.objectContaining({ message: expect.stringContaining('Invalid value') }),
        {
          tokenNetwork,
          target,
          value,
        },
      ),
    );
  });

  test('success with free pfs and valid route', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    const freePfsInfoResponse = { ...pfsInfoResponse, price_info: 0 };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => freePfsInfoResponse),
      text: jest.fn(async () => jsonStringify(freePfsInfoResponse)),
    });

    const result = {
      result: [
        // valid route
        { path: [partner, target], estimated_fee: 1 },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.success(
        { paths: [{ path: [partner, target], fee: bigNumberify(1) as Int<32> }] },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('success with cached iou and valid route', async () => {
    expect.assertions(1);

    action$.next(
      iouPersist(
        { iou: await signIOU(depsMock.signer, iou) },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const result = {
      result: [
        // valid route
        { path: [partner, target], estimated_fee: 1 },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(102),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
      pathFind.success(
        { paths: [{ path: [partner, target], fee: bigNumberify(1) as Int<32> }] },
        { tokenNetwork, target, value },
      ),
    ]);
  });

  test('success from config but filter out invalid pfs result routes', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
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
      text: jest.fn(async () => jsonStringify(result)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.success(
        { paths: [{ path: [partner, target], fee: bigNumberify(1) as Int<32> }] },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail channel not open', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    action$.next(
      channelClose.success(
        { id: channelId, participant: partner, txHash, txBlock: 126, confirmed: true },
        { tokenNetwork, partner },
      ),
    );

    const result = { result: [{ path: [partner, target], estimated_fee: 1 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        { message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail provided route but not enough capacity', async () => {
    expect.assertions(1);

    const value = bigNumberify(80000000) as UInt<32>;

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request(
        { paths: [{ path: [depsMock.address, partner, target], fee }] },
        { tokenNetwork, target, value },
      ),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(
        { message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES },
        { tokenNetwork, target, value },
      ),
    );
  });

  test('fail no route between nodes', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const lastIOUResult = {
      last_iou: {
        ...(await signIOU(depsMock.signer, iou)),
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const errorResult = {
      errors: 'No route between nodes found.',
      error_code: 2201,
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => errorResult),
      text: jest.fn(async () => jsonStringify(errorResult)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(102),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
        }),
        { tokenNetwork, target, value },
      ),
    ]);
  });

  test('fail last iou server error', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED,
          details: { responseStatus: 500, responseText: '{}' },
        }),
        { tokenNetwork, target, value },
      ),
    ]);
  });

  test('fail last iou invalid signature', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const lastIOUResult = {
      last_iou: {
        ...iou,
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
        signature: '0x87ea2a9c6834513dcabfca011c4422eb02a824b8bbbfc8f555d6a6dd2ebbbe953e1a47ad27b9715d8c8cf2da833f7b7d6c8f9bdb997591b7234999901f042caf1f' as Signature,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH,
          details: expect.objectContaining({
            signer: expect.any(String),
            address: depsMock.address,
          }),
        }),
        { tokenNetwork, target, value },
      ),
    ]);
  });

  test('fail iou already claimed', async () => {
    expect.assertions(1);

    const value = bigNumberify(100) as UInt<32>;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const lastIOUResult = {
      last_iou: {
        ...(await signIOU(depsMock.signer, iou)),
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const result = {
      errors:
        'The IOU is already claimed. Please start new session with different `expiration_block`.',
      error_code: 2105,
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      iouClear(undefined, { tokenNetwork, serviceAddress: iou.receiver }),
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_ERROR_RESPONSE,
          details: {
            errors:
              'The IOU is already claimed. Please start new session with different `expiration_block`.',
            errorCode: 2105,
          },
        }),
        { tokenNetwork, target, value },
      ),
    ]);
  });

  test('fail pfs disabled', async () => {
    expect.assertions(2);

    // disable pfs
    action$.next(raidenConfigUpdate({ pfs: null }));

    await expect(
      depsMock.latest$.pipe(pluckDistinct('config', 'pfs'), first()).toPromise(),
    ).resolves.toBeNull();

    const value = bigNumberify(100) as UInt<32>;

    const promise = pathFindServiceEpic(action$, state$, depsMock).toPromise();
    [
      matrixPresence.success(
        { userId: partnerUserId, available: true, ts: Date.now() },
        { address: partner },
      ),
      matrixPresence.success(
        { userId: targetUserId, available: true, ts: Date.now() },
        { address: target },
      ),
      pathFind.request({}, { tokenNetwork, target, value }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject(
      pathFind.failure(expect.objectContaining({ message: ErrorCodes.PFS_DISABLED }), {
        tokenNetwork,
        target,
        value,
      }),
    );
  });
});

describe('PFS: pathFindServiceEpic1', () => {
  const fetch = jest.fn();
  Object.assign(globalThis, { fetch });
  let raiden: MockedRaiden, partner: MockedRaiden, target: MockedRaiden;
  beforeEach(async () => {
    [raiden, partner, target] = await makeRaidens(3);
    const result = { result: [{ path: [partner.address, target.address], estimated_fee: 1234 }] };
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => result,
      ),
      text: jest.fn(async () => jsonStringify(result)),
    });

    raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30 }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    fetch.mockRestore();
    [raiden, partner, target].forEach((node) => {
      node.deps.latest$.complete();
      node.stop();
    });
  });

  test('fail unknown tokenNetwork', async () => {
    expect.assertions(3);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    expect(raiden.output).toContainEqual(
      matrixPresence.success(
        expect.objectContaining({
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: expect.anything(),
        }),
        { address: partner.address },
      ),
    );
    expect(partner.output).toContainEqual(
      matrixPresence.success(
        expect.objectContaining({
          userId: `@${raiden.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: expect.anything(),
        }),
        { address: raiden.address },
      ),
    );

    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    // await ensureTransferUnlocked([raiden, target], amount);
    let targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: token, // purposely put the wrong tokenNetworkAddress
      target: targetAddress,
      value: amount,
    };
    // Emitting the pathFind.request action to check pathFindServiceEpic runs
    // and gives error for incorrect tokenNetwork contract address
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);

    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK,
          details: { tokenNetwork: token },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail target not available', async () => {
    expect.assertions(2);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    let partnerState = partner.store.getState() as RaidenState;
    expect(raiden.output).toContainEqual(
      matrixPresence.success(
        expect.objectContaining({
          userId: partnerState?.transport?.setup?.userId,
          available: true,
          ts: expect.anything(),
        }),
        { address: partner.address },
      ),
    );

    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();
    let targetState = target.store.getState() as RaidenState;
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: targetState?.transport?.setup?.userId as string,
          available: false,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );

    await waitBlock();
    let tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };
    // Emitting the pathFind.request action to check pathFindServiceEpic runs
    // and gets the earlier matrix presence error for target
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target: targetAddress },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail on failing matrix presence request', async () => {
    // expect.assertions(2);

    const matrixError = new Error('Unspecific matrix error for testing purpose');
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: partnerAddress,
      value: amount,
    };

    raiden.store.dispatch(matrixPresence.failure(matrixError, { address: partnerAddress }));
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.request(undefined, { address: partnerAddress }),
    );
    expect(raiden.output).toContainEqual(pathFind.failure(matrixError, pathFindMeta));

    /*
    const promise = pathFindServiceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();
    [
      pathFind.request({}, { tokenNetwork, target: partner, value }),
      matrixPresence.failure(matrixError, { address: partner }),
    ].forEach((a) => action$.next(a));
    setTimeout(() => action$.complete(), 10);

    await expect(promise).resolves.toMatchObject([
      matrixPresence.request(undefined, { address: partner }),
      pathFind.failure(matrixError, {
        tokenNetwork,
        target: partner,
        value,
      }),
    ]); */
  });

  test('fail on successful matrix presence request but target unavailable', async () => {
    // expect.assertions(1);
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: partnerAddress,
      value: amount,
    };
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: false,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.request(undefined, { address: partnerAddress }),
    );
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target: partnerAddress },
        }),
        pathFindMeta,
      ),
    );
  });

  test('success on successful matrix presence request and target available', async () => {
    expect.assertions(2);
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: partnerAddress,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.request(undefined, { address: partnerAddress }),
    );
    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partnerAddress], fee: Zero as Int<32> }] },
        pathFindMeta,
      ),
    );
  });

  test('success provided route', async () => {
    expect.assertions(1);
    const fee = bigNumberify(3) as Int<32>;
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(
      pathFind.request(
        { paths: [{ path: [raiden.address, partner.address, target.address], fee }] },
        pathFindMeta,
      ),
    );

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partner.address, target.address], fee }] },
        pathFindMeta,
      ),
    );
  });

  test('success direct route', async () => {
    expect.assertions(1);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: partnerAddress,
      value: amount,
    };
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    // self should be taken out of route
    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partner.address], fee: Zero as Int<32> }] },
        pathFindMeta,
      ),
    );
  });

  test('success request pfs from action', async () => {
    // original test(old pattern) fails ;)
    expect.assertions(1);

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const pfsSafetyMargin = await raiden.deps.config$
      .pipe(pluck('pfsSafetyMargin'), first(isntNil))
      .toPromise();
    const pfsUrl = await raiden.deps.config$.pipe(pluck('pfs'), first(isntNil)).toPromise();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(
      pathFind.request(
        {
          pfs: {
            address: pfsAddress,
            url: pfsUrl,
            rtt: 3,
            price: One as UInt<32>,
            token: pfsTokenAddress,
          },
        },
        pathFindMeta,
      ),
    );

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            {
              path: [partner.address, target.address],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success request pfs from config', async () => {
    // original test(old pattern) fails ;)
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    let pfsSafetyMargin!: number;
    raiden.deps.config$
      .pipe(first())
      .subscribe((config) => (pfsSafetyMargin = config.pfsSafetyMargin));

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            {
              path: [partner.address, target.address],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success request pfs from pfsList', async () => {
    // expect.assertions(4);

    const pfsAddress1 = '0x0800000000000000000000000000000000000091' as Address,
      pfsAddress2 = '0x0800000000000000000000000000000000000092' as Address,
      pfsAddress3 = '0x0800000000000000000000000000000000000093' as Address;

    // put config.pfs into auto mode
    raiden.store.dispatch(raidenConfigUpdate({ pfs: '' }));

    // pfsAddress1 will be accepted with default https:// schema
    raiden.deps.serviceRegistryContract.functions.urls.mockResolvedValueOnce('domain.only.url');

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    const pfsInfoResponse1 = { ...pfsInfoResponse, payment_address: pfsAddress1 };
    fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                json: jest.fn(async () => pfsInfoResponse1),
                text: jest.fn(async () => jsonStringify(pfsInfoResponse1)),
              }),
            23, // higher rtt for this PFS
          ),
        ),
    );

    // 2 & 3, test sorting by price info
    const pfsInfoResponse2 = { ...pfsInfoResponse, payment_address: pfsAddress2, price_info: 5 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse2),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse2)),
    });

    const pfsInfoResponse3 = { ...pfsInfoResponse, payment_address: pfsAddress3, price_info: 10 };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse3),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse3)),
    });

    // pfsAddress succeeds main response
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    let pfsSafetyMargin!: number;
    raiden.deps.config$
      .pipe(first())
      .subscribe((config) => (pfsSafetyMargin = config.pfsSafetyMargin));

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      pfsListUpdated({
        pfsList: [pfsAddress1, pfsAddress2, pfsAddress3, pfsAddress],
      }),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    const iou = makeIou(raiden, pfsAddress);
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(2),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            {
              path: [partner.address, target.address],
              fee: bigNumberify(1234)
                .mul(pfsSafetyMargin * 1e6)
                .div(1e6) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(4 + 1 + 1);
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
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    raiden.store.dispatch(raidenConfigUpdate({ pfs: '' }));

    // invalid url
    raiden.deps.serviceRegistryContract.functions.urls.mockResolvedValueOnce('""');
    // empty url
    raiden.deps.serviceRegistryContract.functions.urls.mockResolvedValueOnce('');
    // invalid schema
    raiden.deps.serviceRegistryContract.functions.urls.mockResolvedValueOnce(
      'http://not.https.url',
    );

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      pfsListUpdated({
        pfsList: [pfsAddress, pfsAddress, pfsAddress],
      }),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_INVALID_INFO,
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail pfs request error', async () => {
    // Original test(old pattern) does not pass
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => ({ error_code: 1337, errors: 'No route' })),
      text: jest.fn(async () => '{ "error_code": 1337, "errors": "No route" }'),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_ERROR_RESPONSE,
          details: { errorCode: 1337, errors: 'No route' },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail pfs return success but invalid response format', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    // expected 'result', not 'paths'
    const paths = { result: [{ path: [partner, target], estimated_fee: 0 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => paths),
      text: jest.fn(async () => jsonStringify(paths)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: expect.stringContaining('Converting circular structure to JSON'),
        }),
        pathFindMeta,
      ),
    );
  });

  test('success with free pfs and valid route', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    // const value = bigNumberify(100) as UInt<32>;
    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    const freePfsInfoResponse = { ...pfsInfoResponse, price_info: 0 };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => freePfsInfoResponse),
      text: jest.fn(async () => jsonStringify(freePfsInfoResponse)),
    });

    const result = {
      result: [
        // valid route
        { path: [partner.address, target.address], estimated_fee: 1 },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);

    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partner.address, target.address], fee: bigNumberify(1) as Int<32> }] },
        pathFindMeta,
      ),
    );
  });

  test('success with cached iou and valid route', async () => {
    // Original test(old version) fails
    expect.assertions(2);

    const iou = makeIou(raiden, pfsAddress);
    raiden.store.dispatch(
      iouPersist(
        { iou: await signIOU(raiden.deps.signer, iou) },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const result = {
      result: [
        // valid route
        { path: [partner.address, target.address], estimated_fee: 1 },
      ],
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(102),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );
    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partner.address, target.address], fee: bigNumberify(1) as Int<32> }] },
        pathFindMeta,
      ),
    );
  });

  test('success from config but filter out invalid pfs result routes', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 404,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    const result = {
      result: [
        // token isn't a valid channel, should be removed from output
        { path: [token, target.address], estimated_fee: 0 },
        // another route going through token, also should be removed
        { path: [token, partner.address, target.address], estimated_fee: 0 },
        // valid route
        { path: [partner.address, target.address], estimated_fee: 1 },
        // another "valid" route through partner, filtered out because different fee
        { path: [partner.address, token, target.address], estimated_fee: 2 },
        // another invalid route, but we already selected partner first
        { path: [tokenNetwork, target.address], estimated_fee: 3 },
      ],
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        { paths: [{ path: [partner.address, target.address], fee: bigNumberify(1) as Int<32> }] },
        pathFindMeta,
      ),
    );
  });

  test('fail channel not open', async () => {
    expect.assertions(1);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();
    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock();

    const result = { result: [{ path: [partner.address, target.address], estimated_fee: 1 }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
          details: { condition: false },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail provided route but not enough capacity', async () => {
    expect.assertions(1);

    // set an exorbitantly high amount for transfer
    const amount = bigNumberify(80000000) as UInt<32>;
    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(
      pathFind.request(
        { paths: [{ path: [raiden.address, partner.address, target.address], fee }] },
        pathFindMeta,
      ),
    );

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
          details: { condition: false },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail no route between nodes', async () => {
    // Original test(old pattern) failing
    expect.assertions(2);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });
    const iou = makeIou(raiden, pfsAddress);
    const lastIOUResult = {
      last_iou: {
        ...(await signIOU(raiden.deps.signer, iou)),
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const errorResult = {
      errors: 'No route between nodes found.',
      error_code: 2201,
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => errorResult),
      text: jest.fn(async () => jsonStringify(errorResult)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: bigNumberify(102),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail last iou server error', async () => {
    // Original test(old pattern) failed
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => jsonStringify({})),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED,
          details: { responseStatus: 500, responseText: '{}' },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail last iou invalid signature', async () => {
    // Original test(old pattern) failing
    expect.assertions(1);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });
    const iou = makeIou(raiden, pfsAddress);
    const lastIOUResult = {
      last_iou: {
        ...iou,
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
        signature: '0x87ea2a9c6834513dcabfca011c4422eb02a824b8bbbfc8f555d6a6dd2ebbbe953e1a47ad27b9715d8c8cf2da833f7b7d6c8f9bdb997591b7234999901f042caf1f' as Signature,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH,
          details: expect.objectContaining({
            signer: expect.any(String),
            address: raiden.address,
          }),
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail iou already claimed', async () => {
    // Original test(old pattern) failing
    expect.assertions(2);

    const pfsInfoResponse = makePfsInfoResponse(raiden, pfsAddress);
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => pfsInfoResponse),
      text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
    });

    const iou = makeIou(raiden, pfsAddress);
    const lastIOUResult = {
      last_iou: {
        ...(await signIOU(raiden.deps.signer, iou)),
        chain_id: UInt(32).encode(iou.chain_id),
        amount: UInt(32).encode(iou.amount),
        expiration_block: UInt(32).encode(iou.expiration_block),
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const result = {
      errors:
        'The IOU is already claimed. Please start new session with different `expiration_block`.',
      error_code: 2105,
    };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      iouClear(undefined, { tokenNetwork, serviceAddress: iou.receiver }),
    );

    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_ERROR_RESPONSE,
          details: {
            errors:
              'The IOU is already claimed. Please start new session with different `expiration_block`.',
            errorCode: 2105,
          },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail pfs disabled', async () => {
    expect.assertions(2);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await waitBlock();
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);
    await waitBlock();
    // disable pfs
    raiden.store.dispatch(raidenConfigUpdate({ pfs: null }));

    await waitBlock();
    await expect(
      raiden.deps.latest$.pipe(pluckDistinct('config', 'pfs'), first()).toPromise(),
    ).resolves.toBeNull();

    const tokenNetworkAddress = tokenNetwork as Address;
    const targetAddress = target.address as Address;
    const pathFindMeta = {
      tokenNetwork: tokenNetworkAddress,
      target: targetAddress,
      value: amount,
    };

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${partner.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: partner.address },
      ),
    );
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: true,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({ message: ErrorCodes.PFS_DISABLED }),
        pathFindMeta,
      ),
    );
  });
});

describe('PFS: pfsCapacityUpdateEpic', () => {
  test('own channelDeposit.success triggers capacity update', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const pfsRoom = raiden.config.pfsRoom!;
    await ensureChannelIsOpen([raiden, partner]);

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.PFS_CAPACITY_UPDATE }) },
        expect.anything(),
      ),
    );

    await ensureChannelIsDeposited([raiden, partner], deposit);

    expect(raiden.output).toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_CAPACITY_UPDATE,
            updating_participant: raiden.address,
            other_participant: partner.address,
            updating_capacity: deposit,
            signature: expect.any(String),
          }),
        },
        { roomName: expect.stringMatching(pfsRoom) },
      ),
    );
  });

  test("signature fail isn't fatal", async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const signerSpy = jest
      .spyOn(raiden.deps.signer, 'signMessage')
      .mockRejectedValue(new Error('signature rejected'));
    await ensureChannelIsDeposited([raiden, partner], deposit);

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.PFS_CAPACITY_UPDATE }) },
        expect.anything(),
      ),
    );
    expect(raiden.started).toBe(true);
    expect(signerSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PFS: pfsFeeUpdateEpic', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>,
    action$: ReturnType<typeof epicFixtures>['action$'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    token: ReturnType<typeof epicFixtures>['token'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
    isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
    txHash: ReturnType<typeof epicFixtures>['txHash'],
    state$: Observable<RaidenState>,
    action: RaidenAction;

  beforeEach(() => {
    depsMock = raidenEpicDeps();
    ({
      action$,
      tokenNetwork,
      token,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
    } = epicFixtures(depsMock));
    state$ = depsMock.latest$.pipe(pluck('state'));
    action = channelMonitored({ id: channelId }, { tokenNetwork, partner });

    [
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
        },
      }),
      tokenMonitored({ token, tokenNetwork }),
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
    ].forEach((a) => action$.next(a));
  });

  afterAll(() => {
    jest.clearAllMocks();
    action$.complete();
    depsMock.latest$.complete();
  });

  test('success: send PFSFeeUpdate to global pfsRoom on channelMonitored', async () => {
    expect.assertions(1);

    const promise = pfsFeeUpdateEpic(action$, state$, depsMock).toPromise();
    setTimeout(() => {
      action$.next(action);
      action$.complete();
    }, 10);

    await expect(promise).resolves.toEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_FEE_UPDATE,
            signature: expect.any(String),
          }),
        },
        { roomName: expect.stringContaining('path_finding') },
      ),
    );
  });

  test("signature fail isn't fatal", async () => {
    expect.assertions(2);

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');
    signerSpy.mockRejectedValueOnce(new Error('Signature rejected'));

    const promise = pfsFeeUpdateEpic(action$, state$, depsMock).toPromise();
    setTimeout(() => {
      action$.next(action);
      action$.complete();
    }, 10);

    await expect(promise).resolves.toBeUndefined();

    expect(signerSpy).toHaveBeenCalledTimes(1);
    signerSpy.mockRestore();
  });

  test('skip: channel is not open', async () => {
    expect.assertions(1);

    // put channel in 'closing' state
    action$.next(channelClose.request(undefined, { tokenNetwork, partner }));

    const promise = pfsFeeUpdateEpic(action$, state$, depsMock).toPromise();
    setTimeout(() => {
      action$.next(action);
      action$.complete();
    }, 10);

    await expect(promise).resolves.toBeUndefined();
  });

  test('skip: NO_MEDIATE', async () => {
    expect.assertions(1);

    // put channel in 'closing' state
    action$.next(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          [Capabilities.NO_MEDIATE]: true,
        },
      }),
    );

    const promise = pfsFeeUpdateEpic(action$, state$, depsMock).toPromise();
    setTimeout(() => {
      action$.next(action);
      action$.complete();
    }, 10);

    await expect(promise).resolves.toBeUndefined();
  });
});

describe('PFS: pfsFeeUpdateEpic1', () => {
  test('success: send PFSFeeUpdate to global pfsRoom on channelMonitored', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
        },
      }),
    );
    await waitBlock(openBlock - 1);
    await ensureChannelIsOpen([raiden, partner]);
    await waitBlock();

    expect(raiden.output).toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_FEE_UPDATE,
            signature: expect.any(String),
          }),
        },
        { roomName: expect.stringContaining('path_finding') },
      ),
    );
  });

  test("signature fail isn't fatal", async () => {
    // expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
        },
      }),
    );
    const signerSpy = jest.spyOn(raiden.deps.signer, 'signMessage');
    signerSpy.mockRejectedValueOnce(new Error('Signature rejected'));
    await waitBlock(openBlock - 1);
    await ensureChannelIsOpen([raiden, partner]);

    await waitBlock();
    expect(signerSpy).toHaveBeenCalledTimes(1);
    expect(raiden.output).not.toContainEqual(raidenShutdown(expect.anything()));
    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_FEE_UPDATE,
            signature: expect.any(String),
          }),
        },
        expect.anything(),
      ),
    );
    signerSpy.mockRestore();
  });

  test('skip: channel is not open', async () => {
    // expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
        },
      }),
    );
    await waitBlock(openBlock - 1);
    await ensureChannelIsOpen([raiden, partner]);
    await waitBlock();
    const channelId = id;
    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const channelMeta = {
      tokenNetwork: tokenNetworkAddress,
      partner: partnerAddress,
    };
    const index = raiden.output.length;
    // put channel in 'closing' state
    raiden.store.dispatch(channelClose.request(undefined, channelMeta));
    // raiden.store.dispatch(channelMonitored({ id: channelId }, channelMeta));
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    // We expect on the slice because there is already one PFS_FEE_UPDATE message
    // due to opening of the channel earlier
    expect(raiden.output.slice(index)).not.toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_FEE_UPDATE,
            signature: expect.any(String),
          }),
        },
        expect.anything(),
      ),
    );
  });

  test('skip: NO_MEDIATE', async () => {
    // expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          // disable NO_RECEIVE & NO_MEDIATE
        },
      }),
    );
    await waitBlock(openBlock - 1);
    await ensureChannelIsOpen([raiden, partner]);
    await waitBlock();
    const channelId = id;
    const tokenNetworkAddress = tokenNetwork as Address;
    const partnerAddress = partner.address as Address;
    const channelMeta = {
      tokenNetwork: tokenNetworkAddress,
      partner: partnerAddress,
    };
    const index = raiden.output.length;
    // put channel in 'closing' state
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          [Capabilities.NO_MEDIATE]: true,
        },
      }),
    );
    // raiden.store.dispatch(channelMonitored({ id: channelId }, channelMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output.slice(index)).not.toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_FEE_UPDATE,
            signature: expect.any(String),
          }),
        },
        expect.anything(),
      ),
    );
  });
});

describe('PFS: pfsServiceRegistryMonitorEpic', () => {
  const pfsAddress = makeAddress();

  test('success', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { serviceRegistryContract } = raiden.deps;

    // enable config.pfs auto ('')
    raiden.store.dispatch(raidenConfigUpdate({ pfs: '' }));
    await raiden.start();

    await waitBlock();
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

    // expired
    await providersEmit(
      {},
      makeLog({
        filter: serviceRegistryContract.filters.RegisteredService(pfsAddress, null, null, null),
        data: expiredEncoded,
      }),
    );
    await waitBlock();

    // new event from previous expired service, but now valid=true
    await providersEmit(
      {},
      makeLog({
        filter: serviceRegistryContract.filters.RegisteredService(pfsAddress, null, null, null),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );
    await waitBlock();

    // duplicated event, but valid
    await providersEmit(
      {},
      makeLog({
        filter: serviceRegistryContract.filters.RegisteredService(pfsAddress, null, null, null),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );
    await waitBlock();

    // expires while waiting, doesn't make it to the list
    await providersEmit(
      {},
      makeLog({
        filter: serviceRegistryContract.filters.RegisteredService(
          '0x0700000000000000000000000000000000000006',
          null,
          null,
          null,
        ),
        data: expiringSoonEncoded,
      }),
    );
    await waitBlock(raiden.deps.provider.blockNumber + raiden.config.confirmationBlocks + 1);

    await expect(
      raiden.deps.latest$
        .pipe(
          pluck('pfsList'),
          first((l) => l.length > 0),
        )
        .toPromise(),
    ).resolves.toContainEqual(pfsAddress);
  });

  test('noop if config.pfs is set', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();
    const { serviceRegistryContract } = raiden.deps;

    expect(raiden.config.pfs).toBeDefined();

    const validTill = bigNumberify(Math.floor(Date.now() / 1000) + 86400), // tomorrow
      registeredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [validTill, Zero, AddressZero],
      );

    await providersEmit(
      {},
      makeLog({
        filter: serviceRegistryContract.filters.RegisteredService(pfsAddress, null, null, null),
        data: registeredEncoded, // non-indexed valid_till, deposit, deposit_contract
      }),
    );
    await waitBlock();

    expect(raiden.output).not.toContainEqual(pfsListUpdated(expect.anything()));
  });
});

describe('PFS: reducer', () => {
  test('persist and clear', async () => {
    expect.assertions(2);

    const depsMock = raidenEpicDeps();
    const { iou, state, tokenNetwork } = epicFixtures(depsMock);

    const newState = raidenReducer(
      state,
      iouPersist(
        { iou: await signIOU(depsMock.signer, iou) },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );

    expect(newState.iou).toMatchObject({
      [tokenNetwork]: {
        [iou.receiver]: iou,
      },
    });

    const lastState = raidenReducer(
      newState,
      iouClear(undefined, { tokenNetwork, serviceAddress: iou.receiver }),
    );

    expect(lastState.iou).toMatchObject({
      [tokenNetwork]: {},
    });
  });
});
