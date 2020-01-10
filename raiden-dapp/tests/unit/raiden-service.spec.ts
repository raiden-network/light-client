jest.mock('vuex');

import { DeniedReason, Token, TokenModel } from '@/model/types';
import RaidenService, {
  ChannelCloseFailed,
  ChannelDepositFailed,
  ChannelOpenFailed,
  ChannelSettleFailed,
  FindRoutesFailed,
  PFSRequestFailed,
  TransferFailed
} from '@/services/raiden-service';
import { Web3Provider } from '@/services/web3-provider';
import Vuex, { Store } from 'vuex';
import { RootState, Tokens } from '@/types';
import flushPromises from 'flush-promises';
import { Raiden, RaidenSentTransfer } from 'raiden-ts';
import Vue from 'vue';
import { BigNumber, bigNumberify } from 'ethers/utils';
import { BehaviorSubject, EMPTY, of } from 'rxjs';
import { delay } from 'rxjs/internal/operators';
import { One, Zero, AddressZero } from 'ethers/constants';
import Mocked = jest.Mocked;

Vue.use(Vuex);

describe('RaidenService', () => {
  let raidenService: RaidenService;
  let store: Mocked<Store<RootState>>;
  let providerMock: jest.Mock;
  let factory: jest.Mock;
  const mockProvider = {
    send: jest.fn(),
    sendAsync: jest.fn()
  };
  const path = [{ path: ['0xmediator'], fee: new BigNumber(1 ** 10) }];

  const mockRaiden = (overrides: {} = {}) =>
    Object.assign(
      {
        address: '123',
        getBalance: jest.fn().mockResolvedValue(Zero),
        channels$: EMPTY,
        events$: EMPTY,
        // Emit a dummy transfer event every time raiden is mocked
        transfers$: of({}).pipe(delay(1000)),
        getTokenBalance: jest.fn().mockResolvedValue(Zero),
        getTokenList: jest.fn().mockResolvedValue(['0xtoken']),
        getTokenInfo: jest.fn().mockResolvedValue(null),
        getUDCCapacity: jest.fn().mockResolvedValue(Zero),
        userDepositTokenAddress: jest
          .fn()
          .mockResolvedValue('0xuserdeposittoken'),
        start: jest.fn().mockReturnValue(null),
        stop: jest.fn().mockReturnValue(null),
        getAvailability: jest
          .fn()
          .mockResolvedValue({ userId: '123', available: true, ts: 0 })
      },
      overrides
    );

  beforeEach(() => {
    factory = Raiden.create = jest.fn();
    providerMock = Web3Provider.provider = jest.fn();
    store = new Store({}) as Mocked<Store<RootState>>;
    store.commit = jest.fn();
    (store as any).state = {
      tokens: {},
      presences: {},
      transfers: {}
    };
    raidenService = new RaidenService(store);
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  test('verify that the user deposit address is available when the user connects', async () => {
    expect.assertions(1);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden());
    await raidenService.connect();
    await flushPromises();
    expect(raidenService.userDepositTokenAddress).toEqual('0xuserdeposittoken');
  });

  test('throw when the user accesses the user deposit address before connecting', async () => {
    expect.assertions(1);
    const udcAddress = () => raidenService.userDepositTokenAddress;
    expect(udcAddress).toThrowError('address empty');
  });

  test('throw an error when the user calls getAccount before connecting', async () => {
    expect.assertions(1);
    await expect(raidenService.getAccount()).rejects.toThrowError(
      'Raiden instance was not initialized'
    );
  });

  test('return the account when the sdk is connected', async () => {
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden());
    await raidenService.connect();
    await flushPromises();
    expect(await raidenService.getAccount()).toBe('123');
  });

  test('commit a deniedAccess when the throws a denied access error', async () => {
    providerMock.mockRejectedValue('denied');

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith(
      'accessDenied',
      DeniedReason.NO_ACCOUNT
    );
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  test('commit a deniedAccess when the user attempts to connect on an unsupported network', async () => {
    providerMock.mockResolvedValue(mockProvider);
    factory.mockRejectedValue(
      new Error(
        'No deploy info provided nor recognized network: {name: "homestead", chainId: 1}'
      )
    );

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith(
      'accessDenied',
      DeniedReason.UNSUPPORTED_NETWORK
    );
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  test('commit an noProvider when there is no provider detected', async () => {
    providerMock.mockResolvedValue(null);

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith('noProvider');
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  test('throw an error when the user calls openChannel before calling connect', async () => {
    expect.assertions(1);
    await expect(
      raidenService.openChannel('0xaddr', '0xhub', new BigNumber(5000))
    ).rejects.toThrowError('Raiden instance was not initialized');
  });

  test('resolves when channel open and deposit are successful', async () => {
    providerMock.mockResolvedValue(mockProvider);
    const openChannel = jest.fn().mockResolvedValue('0xtxhash');
    const depositChannel = jest.fn().mockResolvedValue('0xtxhash');
    const raidenMock = mockRaiden({
      openChannel: openChannel,
      depositChannel: depositChannel
    });
    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const progress = jest.fn();

    const depositAmount = new BigNumber(100);
    await expect(
      raidenService.openChannel('0xtoken', '0xpartner', depositAmount, progress)
    ).resolves.toBeUndefined();
    expect(openChannel).toBeCalledTimes(1);
    expect(openChannel).toBeCalledWith('0xtoken', '0xpartner');
    expect(depositChannel).toBeCalledTimes(1);
    expect(depositChannel).toBeCalledWith(
      '0xtoken',
      '0xpartner',
      depositAmount
    );

    expect(progress).toHaveBeenCalledTimes(2);
  });

  test('return true and opens a channel but skips deposit when the balance is zero', async () => {
    providerMock.mockResolvedValue(mockProvider);
    const openChannel = jest.fn().mockResolvedValue('0xtxhash');
    const depositChannel = jest.fn().mockResolvedValue('0xtxhash');
    const raidenMock = mockRaiden({
      openChannel: openChannel,
      depositChannel: depositChannel
    });
    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const progress = jest.fn();

    await expect(
      raidenService.openChannel('0xtoken', '0xpartner', Zero, progress)
    ).resolves.toBeUndefined();
    expect(openChannel).toBeCalledTimes(1);
    expect(openChannel).toBeCalledWith('0xtoken', '0xpartner');
    expect(depositChannel).toBeCalledTimes(0);
    expect(progress).toHaveBeenCalledTimes(2);
  });

  test('throw an exception when channel open fails', async () => {
    expect.assertions(1);
    providerMock.mockResolvedValue(mockProvider);
    const openChannel = jest.fn().mockRejectedValue('failed');
    const depositChannel = jest.fn().mockResolvedValue('0xtxhash');
    const raidenMock = mockRaiden({
      openChannel: openChannel,
      depositChannel: depositChannel
    });

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(100);
    await expect(
      raidenService.openChannel('0xtoken', '0xpartner', depositAmount)
    ).rejects.toBeInstanceOf(ChannelOpenFailed);
  });

  test('throw an exception when the deposit fails', async () => {
    expect.assertions(3);
    providerMock.mockResolvedValue(mockProvider);
    const openChannel = jest.fn().mockResolvedValue('0xtxhash');
    const depositChannel = jest.fn().mockRejectedValue('failed');
    const raidenMock = mockRaiden({
      openChannel: openChannel,
      depositChannel: depositChannel
    });

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(100);
    await expect(
      raidenService.openChannel('0xtoken', '0xpartner', depositAmount)
    ).rejects.toBeInstanceOf(ChannelDepositFailed);
    expect(openChannel).toBeCalledTimes(1);
    expect(openChannel).toBeCalledWith('0xtoken', '0xpartner');
  });

  test('return a token object from getTokenBalance when there is no exception', async () => {
    providerMock.mockResolvedValue(mockProvider);
    const balance = new BigNumber('1000000000000000000');
    const tokenBalance = jest.fn().mockResolvedValue(balance);
    const tokenInfo = jest.fn().mockResolvedValue({
      decimals: 18,
      name: 'Test Token 1',
      symbol: 'TT1'
    } as Token);

    const raidenMock = mockRaiden({
      getTokenBalance: tokenBalance,
      getTokenInfo: tokenInfo
    });

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    await raidenService.fetchTokenData(['0xtoken']);
    expect(store.commit).toHaveBeenNthCalledWith(
      5,
      'updateTokens',
      expect.objectContaining({
        '0xtoken': {
          decimals: 18,
          address: '0xtoken',
          balance,
          name: 'Test Token 1',
          symbol: 'TT1'
        } as Token
      } as Tokens)
    );
    expect(tokenBalance).toHaveBeenCalledTimes(1);
    expect(tokenBalance).toHaveBeenCalledWith('0xtoken');
    expect(tokenInfo).toHaveBeenCalledTimes(1);
    expect(tokenInfo).toHaveBeenCalledWith('0xtoken');
  });

  test('starts updating the channels in store when connect is called', async () => {
    providerMock.mockResolvedValue({
      send: jest.fn(),
      sendAsync: jest.fn()
    });
    const stub = new BehaviorSubject({});
    const raidenMock = mockRaiden({
      channels$: stub,
      getTokenList: jest.fn().mockResolvedValue([])
    });

    factory.mockResolvedValue(raidenMock);
    stub.next({});
    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toHaveBeenNthCalledWith(5, 'loadComplete');
    expect(store.commit).toHaveBeenCalledTimes(5);
    raidenService.disconnect();
    expect(raidenMock.stop).toHaveBeenCalledTimes(1);
    expect(raidenMock.start).toHaveBeenCalledTimes(1);
  });

  test('resolves successfully when the channel closes', async () => {
    const closeChannel = jest.fn().mockResolvedValue('0xthash');
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(
      mockRaiden({
        closeChannel: closeChannel
      })
    );

    await raidenService.connect();
    await flushPromises();

    await raidenService.closeChannel('0xtoken', '0xpartner');
    expect(closeChannel).toHaveBeenCalledTimes(1);
    expect(closeChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
  });

  test('throw an exception when close fails', async () => {
    expect.assertions(3);
    const closeChannel = jest.fn().mockRejectedValue(new Error('txfailed'));
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(
      mockRaiden({
        closeChannel: closeChannel
      })
    );

    await raidenService.connect();
    await flushPromises();

    await expect(
      raidenService.closeChannel('0xtoken', '0xpartner')
    ).rejects.toBeInstanceOf(ChannelCloseFailed);
    expect(closeChannel).toHaveBeenCalledTimes(1);
    expect(closeChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
  });

  test('resolves when deposit is successful', async () => {
    expect.assertions(2);
    const depositChannel = jest.fn().mockResolvedValue('0xtxhash');
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(
      mockRaiden({
        depositChannel: depositChannel
      })
    );

    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(6000);
    await raidenService.deposit('0xtoken', '0xpartner', depositAmount);
    expect(depositChannel).toHaveBeenCalledTimes(1);
    expect(depositChannel).toHaveBeenCalledWith(
      '0xtoken',
      '0xpartner',
      depositAmount
    );
  });

  test('throw when deposit fails', async () => {
    expect.assertions(3);
    const depositChannel = jest.fn().mockRejectedValue('txfailed');
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(
      mockRaiden({
        depositChannel: depositChannel
      })
    );

    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(6000);
    await expect(
      raidenService.deposit('0xtoken', '0xpartner', depositAmount)
    ).rejects.toBeInstanceOf(ChannelDepositFailed);
    expect(depositChannel).toHaveBeenCalledTimes(1);
    expect(depositChannel).toHaveBeenCalledWith(
      '0xtoken',
      '0xpartner',
      depositAmount
    );
  });

  describe('settleChannel', () => {
    test('resolves when settle is successful', async () => {
      const settleChannel = jest.fn().mockResolvedValue('txhash');
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          settleChannel: settleChannel
        })
      );

      await raidenService.connect();
      await flushPromises();

      await expect(raidenService.settleChannel('0xtoken', '0xpartner'))
        .resolves;
      expect(settleChannel).toHaveBeenCalledTimes(1);
      expect(settleChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
    });

    test('throw when settle fails', async () => {
      const settleChannel = jest.fn().mockRejectedValue('txfailed');
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          settleChannel: settleChannel
        })
      );

      await raidenService.connect();
      await flushPromises();

      await expect(
        raidenService.settleChannel('0xtoken', '0xpartner')
      ).rejects.toBeInstanceOf(ChannelSettleFailed);
      expect(settleChannel).toHaveBeenCalledTimes(1);
      expect(settleChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
    });
  });

  describe('token caching', () => {
    const mockToken1 = '0xtoken1';
    const mockToken2 = '0xtoken2';

    const mockToken = (address: string): Token => ({
      address: address,
      balance: Zero,
      decimals: 18,
      name: address,
      symbol: address.replace('0x', '').toLocaleUpperCase()
    });

    const tokens: Tokens = {};
    tokens[mockToken1] = mockToken(mockToken1);
    tokens[mockToken2] = mockToken(mockToken2);

    beforeEach(() => {
      store.commit = jest.fn();

      const getTokenList = jest
        .fn()
        .mockResolvedValue([mockToken1, mockToken2]);
      const getTokenInfo = jest.fn().mockImplementation(mockToken);
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          getTokenList,
          getTokenInfo,
          start: jest.fn()
        })
      );
    });

    test('updates the tokens when it fetches a non-cached token ', async () => {
      const mockStore = store as any;
      mockStore.state = {
        tokens: {
          [mockToken1]: {
            address: mockToken1,
            placeholder: true
          },
          [mockToken2]: {
            address: mockToken2,
            placeholder: true
          }
        }
      };
      mockStore.getters = {
        tokens: [{ address: mockToken1 } as TokenModel]
      };

      await raidenService.connect();
      await flushPromises();

      expect(store.commit).toHaveBeenCalledTimes(4);

      expect(store.commit).toHaveBeenNthCalledWith(1, 'account', '123');
      expect(store.commit).toHaveBeenNthCalledWith(2, 'balance', '0.0');
      expect(store.commit).toHaveBeenNthCalledWith(4, 'loadComplete');

      await raidenService.fetchTokenData(['0xtoken1']);

      expect(store.commit).toHaveBeenNthCalledWith(5, 'updateTokens', {
        [mockToken1]: tokens[mockToken1]
      });
    });

    test('checks for the connected token balances when it receives a new block event', async () => {
      expect.assertions(2);

      const mockStore = store as any;

      mockStore.state = {
        tokens: {
          [mockToken1]: {
            address: mockToken1
          },
          [mockToken2]: {
            address: mockToken2
          }
        }
      };

      mockStore.getters = {
        tokens: [
          {
            address: mockToken1
          } as TokenModel
        ]
      };

      providerMock.mockResolvedValue({
        send: jest.fn(),
        sendAsync: jest.fn()
      });
      const subject = new BehaviorSubject({});
      const testToken: Token = {
        address: mockToken1,
        decimals: 18,
        name: 'Token 1',
        symbol: 'TKN1'
      };

      const raidenMock = mockRaiden({
        getTokenBalance: jest.fn().mockResolvedValue(One),
        events$: subject,
        getTokenList: jest.fn().mockResolvedValue([mockToken1]),
        getTokenInfo: jest.fn().mockResolvedValue(testToken)
      });

      factory.mockResolvedValue(raidenMock);
      await raidenService.connect();
      await flushPromises();
      subject.next({ type: 'newBlock' });
      await flushPromises();

      expect(store.commit).toHaveBeenCalledTimes(5);
      expect(store.commit).toHaveBeenNthCalledWith(
        5,
        'updateTokens',
        expect.objectContaining({
          [mockToken1]: {
            ...testToken,
            balance: One
          }
        })
      );
    });

    test('loads the token list', async () => {
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          getTokenList: jest.fn().mockResolvedValue([mockToken1, mockToken2]),
          getTokenBalance: jest.fn().mockResolvedValueOnce(bigNumberify(100)),
          getTokenInfo: jest.fn().mockResolvedValueOnce({
            decimals: 0,
            symbol: 'MKT',
            name: 'Mock Token'
          })
        })
      );
      await raidenService.connect();
      await flushPromises();
      store.commit.mockReset();
      await raidenService.fetchTokenList();
      await flushPromises();
      expect(store.commit).toBeCalledTimes(2);
      expect(store.commit).toHaveBeenNthCalledWith(
        1,
        'updateTokens',
        expect.objectContaining({
          [mockToken1]: { address: mockToken1 }
        })
      );
      expect(store.commit).toHaveBeenNthCalledWith(
        2,
        'updateTokens',
        expect.objectContaining({
          [mockToken1]: {
            address: mockToken1,
            balance: bigNumberify(100),
            decimals: 0,
            symbol: 'MKT',
            name: 'Mock Token'
          }
        })
      );
    });
  });

  test('clears the app state when it receives a raidenShutdown event', async () => {
    expect.assertions(2);

    const mockStore = store as any;
    mockStore.getters = {
      tokens: []
    };
    mockStore.state = {
      tokens: {}
    };

    providerMock.mockResolvedValue({
      send: jest.fn(),
      sendAsync: jest.fn()
    });

    const subject = new BehaviorSubject({});
    const raidenMock = mockRaiden({
      events$: subject,
      getTokenList: jest.fn().mockResolvedValue([])
    });

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();
    subject.next({ type: 'raidenShutdown' });
    await flushPromises();

    expect(store.commit).toHaveBeenCalledTimes(5);
    expect(store.commit).toHaveBeenLastCalledWith('reset');
  });

  test('update the store with the proper reason when the factory throws an exception', async () => {
    providerMock.mockResolvedValue({
      send: jest.fn(),
      sendAsync: jest.fn()
    });
    factory.mockRejectedValue(new Error('create failed'));
    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith(
      'accessDenied',
      DeniedReason.INITIALIZATION_FAILED
    );
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  describe('transfer', () => {
    test('resolves when a transfer succeeds', async () => {
      const transfer = jest.fn().mockResolvedValue(One);
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          transfer: transfer,
          getAvailability: jest.fn()
        })
      );

      await raidenService.connect();
      await flushPromises();

      await expect(raidenService.transfer('0xtoken', '0xpartner', One, path))
        .resolves;
      expect(transfer).toHaveBeenCalledTimes(1);
      expect(transfer).toHaveBeenCalledWith('0xtoken', '0xpartner', One, {
        paths: path
      });
    });

    test('throw when a transfer fails', async () => {
      const transfer = jest.fn().mockRejectedValue('txfailed');
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          transfer: transfer,
          getAvailability: jest.fn()
        })
      );

      await raidenService.connect();
      await flushPromises();

      await expect(
        raidenService.transfer('0xtoken', '0xpartner', One, path)
      ).rejects.toBeInstanceOf(TransferFailed);
      expect(transfer).toHaveBeenCalledTimes(1);
      expect(transfer).toHaveBeenCalledWith('0xtoken', '0xpartner', One, {
        paths: path
      });
    });
  });

  test('resolves an ens domain', async () => {
    const resolveName = jest.fn().mockResolvedValue(AddressZero);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ resolveName }));

    await raidenService.connect();
    await flushPromises();

    expect(await raidenService.ensResolve('domain.eth')).toEqual(AddressZero);
    expect(resolveName).toHaveBeenCalledTimes(1);
  });

  test('resolves a list of the available path-finding services', async () => {
    const findPFS = jest.fn().mockResolvedValueOnce([]);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ findPFS }));
    await raidenService.connect();
    await flushPromises();
    await expect(raidenService.fetchServices()).resolves.toEqual([]);
  });

  test('rejects when there is an error while geting the available path-finding services', async () => {
    const findPFS = jest.fn().mockRejectedValue(new Error('failed'));
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ findPFS }));
    await raidenService.connect();
    await flushPromises();
    await expect(raidenService.fetchServices()).rejects.toBeInstanceOf(
      PFSRequestFailed
    );
  });

  describe('findRoutes', () => {
    test('rejects when it cannot find routes: no availability', async () => {
      const getAvailability = jest
        .fn()
        .mockRejectedValue(new Error('target offline'));
      const findRoutes = jest
        .fn()
        .mockRejectedValue(new Error('should not reach findRoutes'));
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(mockRaiden({ getAvailability, findRoutes }));
      await raidenService.connect();
      await flushPromises();
      await expect(
        raidenService.findRoutes(AddressZero, AddressZero, One)
      ).rejects.toBeInstanceOf(FindRoutesFailed);
      await expect(
        raidenService.findRoutes(AddressZero, AddressZero, One)
      ).rejects.toThrowError('target offline');
    });

    test('rejects when it cannot find routes: no routes', async () => {
      const getAvailability = jest.fn().mockResolvedValue(AddressZero);
      const findRoutes = jest.fn().mockRejectedValue(new Error('no path'));
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(mockRaiden({ getAvailability, findRoutes }));
      await raidenService.connect();
      await flushPromises();
      await expect(
        raidenService.findRoutes(AddressZero, AddressZero, One)
      ).rejects.toBeInstanceOf(FindRoutesFailed);
      await expect(
        raidenService.findRoutes(AddressZero, AddressZero, One)
      ).rejects.toThrowError('no path');
    });

    test('resolves when it can find routes', async () => {
      const getAvailability = jest.fn().mockResolvedValueOnce(AddressZero);
      const findRoutes = jest.fn().mockResolvedValueOnce([]);
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(mockRaiden({ getAvailability, findRoutes }));
      await raidenService.connect();
      await flushPromises();
      await expect(
        raidenService.findRoutes(AddressZero, AddressZero, One)
      ).resolves.toEqual([]);
    });
  });

  describe('availability', () => {
    test('returns true when target is online', async () => {
      const getAvailability = jest.fn().mockResolvedValue({ available: true });
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          getAvailability
        })
      );

      await raidenService.connect();
      await flushPromises();

      const isAvailable = await raidenService.getAvailability('0xtarget');
      expect(isAvailable).toBe(true);
      expect(getAvailability).toHaveBeenCalledTimes(1);
    });

    test('returns false when target is offline', async () => {
      const getAvailability = jest.fn().mockRejectedValue({});
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          getAvailability
        })
      );

      await raidenService.connect();
      await flushPromises();

      const isAvailable = await raidenService.getAvailability('0xtarget');
      expect(isAvailable).toBe(false);
      expect(getAvailability).toHaveBeenCalledTimes(1);
      expect(getAvailability).rejects;
      expect(store.commit).toBeCalledTimes(5);
      expect(store.commit).toBeCalledWith('updatePresence', {
        ['0xtarget']: false
      });
    });

    test('save transfers in store', async () => {
      const dummyTransfer = {
        initiator: '123',
        secrethash: '0x1',
        completed: false
      };
      const subject = new BehaviorSubject(dummyTransfer);
      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(
        mockRaiden({
          transfers$: subject
        })
      );

      await raidenService.connect();
      await flushPromises();

      expect(store.commit).toBeCalledTimes(5);
      expect(store.commit).toHaveBeenNthCalledWith(
        5,
        'updateTransfers',
        expect.objectContaining({
          ...dummyTransfer
        } as RaidenSentTransfer)
      );
    });
  });
});
