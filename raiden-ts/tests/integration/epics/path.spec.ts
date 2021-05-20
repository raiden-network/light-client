import {
  amount,
  deposit,
  ensureChannelIsClosed,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  fee,
  getChannel,
  openBlock,
  token,
  tokenNetwork,
} from '../fixtures';
import { fetch, makeLog, makeRaiden, makeRaidens, providersEmit, waitBlock } from '../mocks';

import { defaultAbiCoder } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, One, Zero } from '@ethersproject/constants';

import { raidenConfigUpdate, raidenShutdown } from '@/actions';
import { Capabilities } from '@/constants';
import { messageServiceSend } from '@/messages/actions';
import { MessageType } from '@/messages/types';
import { raidenReducer } from '@/reducer';
import { iouClear, iouPersist, pathFind, servicesValid } from '@/services/actions';
import { IOU, PfsMode, Service } from '@/services/types';
import { signIOU } from '@/services/utils';
import { matrixPresence } from '@/transport/actions';
import { jsonStringify } from '@/utils/data';
import { ErrorCodes } from '@/utils/error';
import type { Address, Int, Signature, UInt } from '@/utils/types';
import { Signed } from '@/utils/types';

import { makeAddress, sleep } from '../../utils';
import type { MockedRaiden } from '../mocks';

const pfsAddress = makeAddress();

/**
 * @param raiden - Instance of MockedRaiden
 * @returns Mocked IOU type Object
 */
function makeIou(raiden: MockedRaiden): IOU {
  return {
    sender: raiden.address,
    receiver: pfsAddress,
    one_to_n_address: '0x0A0000000000000000000000000000000000000a' as Address,
    chain_id: BigNumber.from(raiden.deps.network.chainId) as UInt<32>,
    expiration_block: BigNumber.from(3232341) as UInt<32>,
    amount: BigNumber.from(100) as UInt<32>,
  };
}

function makeValidServices(services: Address[]) {
  const validTill = Date.now() + 86.4e6;
  return Object.fromEntries(services.map((service) => [service, validTill]));
}

describe('PFS: pfsRequestEpic', () => {
  let raiden: MockedRaiden, partner: MockedRaiden, target: MockedRaiden;
  const pfsSafetyMargin = 2;

  const mockedPfsInfoResponse: jest.MockedFunction<typeof fetch> = jest.fn();
  const mockedIouResponse: jest.MockedFunction<typeof fetch> = jest.fn();
  const mockedPfsResponse: jest.MockedFunction<typeof fetch> = jest.fn();

  function makePfsInfoResponse() {
    return {
      message: 'pfs message',
      network_info: {
        chain_id: raiden.deps.network.chainId,
        token_network_registry_address: raiden.deps.contractsInfo.TokenNetworkRegistry.address,
      },
      operator: 'pfs operator',
      payment_address: pfsAddress,
      price_info: 2,
      version: '0.4.1',
    };
  }

  beforeEach(async () => {
    mockedPfsInfoResponse.mockImplementation(async () => {
      const pfsInfoResponse = makePfsInfoResponse();
      return {
        status: 200,
        ok: true,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      };
    });

    mockedIouResponse.mockImplementation(async () => {
      const result = { error: 'Not found' };
      return {
        status: 404,
        ok: false,
        json: jest.fn(async () => result),
        text: jest.fn(async () => jsonStringify(result)),
      };
    });

    mockedPfsResponse.mockImplementation(async () => {
      const result = {
        result: [{ path: [partner.address, target.address], estimated_fee: fee.toNumber() }],
      };
      return {
        status: 200,
        ok: true,
        json: jest.fn(async () => result),
        text: jest.fn(async () => jsonStringify(result)),
      };
    });

    fetch.mockImplementation(async (...args) => {
      const url = args[0];
      if (url?.includes?.('/iou')) {
        return mockedIouResponse(...args);
      } else if (url?.includes?.('/info')) {
        return mockedPfsInfoResponse(...args);
      } else {
        return mockedPfsResponse(...args);
      }
    });

    [raiden, partner, target] = await makeRaidens(3);

    await waitBlock(openBlock - 1);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsOpen([partner, target], { channelId: 18 });
    await ensureChannelIsDeposited([partner, target], deposit);

    raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 30, pfsSafetyMargin }));
  });

  afterEach(async () => {
    await new Promise(setImmediate);
    jest.clearAllMocks();
    mockedPfsInfoResponse.mockRestore();
    mockedIouResponse.mockRestore();
    mockedPfsResponse.mockRestore();
  });

  test('fail unknown tokenNetwork', async () => {
    expect.assertions(1);

    // await ensureTransferUnlocked([raiden, target], amount);
    const pathFindMeta = {
      tokenNetwork: token, // purposely put the wrong tokenNetwork
      target: target.address,
      value: amount,
    };
    // Emitting the pathFind.request action to check pfsRequestEpic runs
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
    expect.assertions(1);

    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: target.store.getState().transport.setup!.userId,
          available: false,
          ts: Date.now(),
        },
        { address: target.address },
      ),
    );

    await waitBlock();
    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    // Emitting the pathFind.request action to check pfsRequestEpic runs
    // and gets the earlier matrix presence error for target
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target: target.address },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail on failing matrix presence request', async () => {
    expect.assertions(2);

    const matrix = await raiden.deps.matrix$.toPromise();
    const matrixError = new Error('Unspecific matrix error for testing purpose');
    (
      matrix.searchUserDirectory as jest.MockedFunction<typeof matrix.searchUserDirectory>
    ).mockRejectedValue(matrixError);

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };

    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.request(undefined, { address: target.address }),
    );
    expect(raiden.output).toContainEqual(pathFind.failure(matrixError, pathFindMeta));
  });

  test('fail on successful matrix presence request but target unavailable', async () => {
    expect.assertions(1);

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(
      matrixPresence.success(
        {
          userId: `@${target.address.toLowerCase()}:matrix.raiden.test`,
          available: false,
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
          message: ErrorCodes.PFS_TARGET_OFFLINE,
          details: { target: target.address },
        }),
        pathFindMeta,
      ),
    );
  });

  test('success on successful matrix presence request and target available', async () => {
    expect.assertions(2);

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      matrixPresence.request(undefined, { address: target.address }),
    );
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            { path: [partner.address, target.address], fee: fee.mul(pfsSafetyMargin) as Int<32> },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success provided route', async () => {
    expect.assertions(1);

    const fee = BigNumber.from(3) as Int<32>;
    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(
      pathFind.request(
        {
          paths: [
            {
              path: [raiden.address, partner.address, target.address],
              fee: fee.mul(pfsSafetyMargin) as Int<32>,
            },
          ],
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
            { path: [partner.address, target.address], fee: fee.mul(pfsSafetyMargin) as Int<32> },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success direct route', async () => {
    expect.assertions(1);

    const pathFindMeta = {
      tokenNetwork,
      target: partner.address,
      value: amount,
    };
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

    const pfsUrl = raiden.config.additionalServices[0];
    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };

    raiden.store.dispatch(
      pathFind.request(
        {
          pfs: {
            address: pfsAddress,
            url: pfsUrl,
            rtt: 3,
            price: One as UInt<32>,
            token: (await raiden.deps.serviceRegistryContract.token()) as Address,
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
              fee: fee.mul(pfsSafetyMargin) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success request pfs from config', async () => {
    expect.assertions(1);

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            {
              path: [partner.address, target.address],
              fee: fee.mul(pfsSafetyMargin) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success request auto pfs from registered services', async () => {
    expect.assertions(4);

    const pfsAddress1 = '0x0800000000000000000000000000000000000091' as Address,
      pfsAddress2 = '0x0800000000000000000000000000000000000092' as Address,
      pfsAddress3 = '0x0800000000000000000000000000000000000093' as Address;

    const urls = {
      [pfsAddress]: 'https://pfs.raiden.test',
      [pfsAddress1]: 'domain.only.url',
      [pfsAddress2]: 'http://pfs2.raiden.test',
      [pfsAddress3]: 'http://pfs3.raiden.test',
    };

    const pfsSafetyMargin = 2;
    raiden.store.dispatch(raidenConfigUpdate({ pfsMode: PfsMode.auto, additionalServices: [] }));

    // pfsAddress1 will be accepted with default https:// schema
    raiden.deps.serviceRegistryContract.urls.mockImplementation(async (addr) => urls[addr]);

    const pfsInfoResponse = makePfsInfoResponse();

    const pfsInfoResponse1 = { ...pfsInfoResponse, payment_address: pfsAddress1 };
    // 2 & 3, test sorting by price info
    const pfsInfoResponse2 = { ...pfsInfoResponse, payment_address: pfsAddress2, price_info: 5 };
    const pfsInfoResponse3 = { ...pfsInfoResponse, payment_address: pfsAddress3, price_info: 10 };

    mockedPfsInfoResponse.mockImplementation(async (url) => {
      let response: unknown;
      let rtt = 0;
      if (url?.includes(urls[pfsAddress])) response = pfsInfoResponse;
      else if (url?.includes(urls[pfsAddress1])) {
        response = pfsInfoResponse1;
        rtt = 23; // higher rtt for this PFS
      } else if (url?.includes(urls[pfsAddress2])) response = pfsInfoResponse2;
      else if (url?.includes(urls[pfsAddress3])) response = pfsInfoResponse3;
      else throw new Error('should not happen');
      if (rtt) await sleep(rtt);
      return {
        ok: true,
        status: 200,
        json: jest.fn(async () => response),
        text: jest.fn(async () => jsonStringify(response)),
      };
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };

    raiden.store.dispatch(
      servicesValid(makeValidServices([pfsAddress1, pfsAddress2, pfsAddress3, pfsAddress])),
    );
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    const iou = makeIou(raiden);
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);

    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: BigNumber.from(2),
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
              fee: fee.mul(pfsSafetyMargin) as Int<32>,
            },
          ],
        },
        pathFindMeta,
      ),
    );
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

    raiden.store.dispatch(raidenConfigUpdate({ pfsMode: PfsMode.auto, additionalServices: [] }));

    // invalid url
    raiden.deps.serviceRegistryContract.urls.mockResolvedValueOnce('""');
    // empty url
    raiden.deps.serviceRegistryContract.urls.mockResolvedValueOnce('');
    // invalid schema (on development mode, both http & https are accepted)
    raiden.deps.serviceRegistryContract.urls.mockResolvedValueOnce('ftp://not.https.url');

    raiden.store.dispatch(servicesValid(makeValidServices([pfsAddress, pfsAddress, pfsAddress])));
    await waitBlock();

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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

    const error = { error_code: 1337, errors: 'No route' };
    mockedPfsResponse.mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn(async () => error),
      text: jest.fn(async () => jsonStringify(error)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_ERROR_RESPONSE,
          details: { errorCode: error.error_code, errors: 'No route' },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail pfs return success but invalid response format', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    // expected 'result', not 'paths'
    const paths = { paths: [{ path: [partner.address, target.address], estimated_fee: 0 }] };
    mockedPfsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => paths),
      text: jest.fn(async () => jsonStringify(paths)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: expect.stringContaining('Invalid value'),
        }),
        pathFindMeta,
      ),
    );
  });

  test('success with free pfs and valid route', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    const freePfsInfoResponse = { ...makePfsInfoResponse(), price_info: 0 };
    mockedPfsInfoResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => freePfsInfoResponse),
      text: jest.fn(async () => jsonStringify(freePfsInfoResponse)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);

    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            { path: [partner.address, target.address], fee: fee.mul(pfsSafetyMargin) as Int<32> },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('success with cached iou and valid route', async () => {
    expect.assertions(2);

    const iou = makeIou(raiden);
    raiden.store.dispatch(
      iouPersist(
        { iou: await signIOU(raiden.deps.signer, iou) },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );

    raiden.output.splice(0, raiden.output.length);
    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(raiden.config.httpTimeout);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            { path: [partner.address, target.address], fee: fee.mul(pfsSafetyMargin) as Int<32> },
          ],
        },
        pathFindMeta,
      ),
    );
    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: iou.amount.add(2),
          }),
        },
        { tokenNetwork, serviceAddress: iou.receiver },
      ),
    );
  });

  test('success from config but filter out invalid pfs result routes', async () => {
    // Original test(old version) fails
    expect.assertions(1);

    const result = {
      result: [
        // token isn't a valid channel, should be removed from output
        { path: [token, target.address], estimated_fee: 0 },
        // another route going through token, also should be removed
        { path: [token, partner.address, target.address], estimated_fee: 0 },
        // valid route
        { path: [partner.address, target.address], estimated_fee: 1 },
        // another "valid" route through partner, filtered out because different fee
        { path: [partner.address, token, target.address], estimated_fee: 5 },
        // another invalid route, but we already selected partner first
        { path: [tokenNetwork, target.address], estimated_fee: 10 },
      ],
    };
    mockedPfsResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.success(
        {
          paths: [
            { path: [partner.address, target.address], fee: One.mul(pfsSafetyMargin) as Int<32> },
          ],
        },
        pathFindMeta,
      ),
    );
  });

  test('fail channel not open', async () => {
    expect.assertions(1);

    await ensureChannelIsClosed([raiden, partner]);

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      pathFind.failure(
        expect.objectContaining({
          message: ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail provided route but not enough capacity', async () => {
    expect.assertions(1);

    // set an exorbitantly high amount for transfer
    const amount = BigNumber.from(80000000) as UInt<32>;

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail no route between nodes', async () => {
    // Original test(old pattern) failing
    expect.assertions(2);

    const iou = makeIou(raiden);
    const lastIOUResult = { last_iou: Signed(IOU).encode(await signIOU(raiden.deps.signer, iou)) };
    mockedIouResponse.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const errorResult = {
      errors: 'No route between nodes found.',
      error_code: 2201,
    };
    mockedPfsResponse.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(async () => errorResult),
      text: jest.fn(async () => jsonStringify(errorResult)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
    raiden.store.dispatch(pathFind.request({}, pathFindMeta));

    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);
    expect(raiden.output).toContainEqual(
      iouPersist(
        {
          iou: expect.objectContaining({
            amount: BigNumber.from(102),
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

    mockedIouResponse.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn(async () => {
        /* error */
      }),
      text: jest.fn(async () => '{}'),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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

    const iou = makeIou(raiden);
    const lastIOUResult = {
      last_iou: Signed(IOU).encode({
        ...iou,
        signature:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Signature,
      }),
    };
    mockedIouResponse.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => lastIOUResult),
      text: jest.fn(async () => jsonStringify(lastIOUResult)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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

    const iou = makeIou(raiden);
    const lastIOUResult = {
      last_iou: Signed(IOU).encode(await signIOU(raiden.deps.signer, iou)),
    };
    mockedIouResponse.mockResolvedValueOnce({
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
    mockedPfsResponse.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn(async () => result),
      text: jest.fn(async () => jsonStringify(result)),
    });

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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
          details: { errors: result.errors, errorCode: result.error_code },
        }),
        pathFindMeta,
      ),
    );
  });

  test('fail pfs disabled', async () => {
    expect.assertions(1);

    // disable pfs
    raiden.store.dispatch(raidenConfigUpdate({ pfsMode: PfsMode.disabled }));

    const pathFindMeta = {
      tokenNetwork,
      target: target.address,
      value: amount,
    };
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
    await ensureChannelIsOpen([raiden, partner]);

    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.PFS_CAPACITY_UPDATE }) },
        expect.anything(),
      ),
    );

    await ensureChannelIsDeposited([raiden, partner], deposit);

    expect(raiden.output).toContainEqual(
      messageServiceSend.request(
        {
          message: expect.objectContaining({
            type: MessageType.PFS_CAPACITY_UPDATE,
            updating_participant: raiden.address,
            other_participant: partner.address,
            updating_capacity: deposit,
            signature: expect.any(String),
          }),
        },
        { service: Service.PFS, msgId: expect.any(String) },
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
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.PFS_CAPACITY_UPDATE }) },
        expect.anything(),
      ),
    );
    expect(raiden.started).toBe(true);
    expect(signerSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PFS: pfsFeeUpdateEpic', () => {
  test('success: send PFSFeeUpdate to global pfsRoom on channelMonitored', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.DELIVERY]: 0,
          // enable RECEIVE & MEDIATE
        },
      }),
    );
    await ensureChannelIsOpen([raiden, partner]);
    const channel = getChannel(raiden, partner);

    expect(raiden.output).toContainEqual(
      messageServiceSend.request(
        {
          message: {
            type: MessageType.PFS_FEE_UPDATE,
            canonical_identifier: {
              chain_identifier: BigNumber.from(raiden.deps.network.chainId) as UInt<32>,
              token_network_address: tokenNetwork,
              channel_identifier: BigNumber.from(channel.id) as UInt<32>,
            },
            updating_participant: raiden.address,
            timestamp: expect.any(String),
            fee_schedule: expect.objectContaining({ cap_fees: true }),
            signature: expect.any(String),
          },
        },
        { service: Service.PFS, msgId: expect.any(String) },
      ),
    );
  });

  test("signature fail isn't fatal", async () => {
    // expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.DELIVERY]: 0,
          // enable RECEIVE & MEDIATE
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
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.PFS_FEE_UPDATE }) },
        expect.anything(),
      ),
    );
    signerSpy.mockRestore();
  });

  test('skip: !MEDIATE', async () => {
    // expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      raidenConfigUpdate({
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
        },
      }),
    );
    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock();
    expect(raiden.output).not.toContainEqual(
      messageServiceSend.request(
        { message: expect.objectContaining({ type: MessageType.PFS_FEE_UPDATE }) },
        expect.anything(),
      ),
    );
  });
});

describe('PFS: pfsServiceRegistryMonitorEpic', () => {
  test('success', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { serviceRegistryContract } = raiden.deps;

    raiden.store.dispatch(raidenConfigUpdate({ pfsMode: PfsMode.auto }));
    await raiden.start();

    const validTill = BigNumber.from(Math.floor(Date.now() / 1000) + 86400), // tomorrow
      registeredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [validTill, Zero, AddressZero],
      ),
      expiredEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [BigNumber.from(Math.floor(Date.now() / 1000) - 86400), Zero, AddressZero],
      ),
      expiringSoonEncoded = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'address'],
        [BigNumber.from(Math.floor(Date.now() / 1000) + 1), Zero, AddressZero],
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

    expect(raiden.store.getState()).toMatchObject({
      services: { [pfsAddress]: expect.any(Number) },
    });
  });
});

describe('PFS: reducer', () => {
  test('persist and clear', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden(undefined);
    const iou = makeIou(raiden);
    const newState = raidenReducer(
      raiden.store.getState(),
      iouPersist(
        { iou: await signIOU(raiden.deps.signer, iou) },
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
