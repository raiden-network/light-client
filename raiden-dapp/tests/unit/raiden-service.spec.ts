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
import { Raiden } from 'raiden-ts';
import Vue from 'vue';
import { BigNumber } from 'ethers/utils';
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
        stop: jest.fn().mockReturnValue(null)
      },
      overrides
    );

  beforeEach(() => {
    factory = Raiden.create = jest.fn();
    providerMock = Web3Provider.provider = jest.fn();
    store = new Store({}) as Mocked<Store<RootState>>;
    store.commit = jest.fn();
    (store as any).state = {
      tokens: {}
    };
    raidenService = new RaidenService(store);
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  test('after connect user deposit address should be available', async () => {
    expect.assertions(1);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden());
    await raidenService.connect();
    await flushPromises();
    expect(raidenService.userDepositTokenAddress).toEqual('0xuserdeposittoken');
  });

  test('user deposit address should throw if not connected', async () => {
    expect.assertions(1);
    const udcAddress = () => raidenService.userDepositTokenAddress;
    expect(udcAddress).toThrowError('address empty');
  });

  test('should throw an error if raiden is not initialized when calling getAccount', async () => {
    expect.assertions(1);
    await expect(raidenService.getAccount()).rejects.toThrowError(
      'Raiden instance was not initialized'
    );
  });

  test('should return the account after raiden is initialized', async () => {
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden());
    await raidenService.connect();
    await flushPromises();
    expect(await raidenService.getAccount()).toBe('123');
  });

  test('should commit a deniedAccess when the provider access is denied', async () => {
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

  test('commit a deniedAccess when the connect method throws on invalid network', async () => {
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

  test('should commit an noProvider when there is no provider detected', async () => {
    providerMock.mockResolvedValue(null);

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith('noProvider');
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  test('should throw an error when attempting to open a channel before connecting', async () => {
    expect.assertions(1);
    await expect(
      raidenService.openChannel('0xaddr', '0xhub', new BigNumber(5000))
    ).rejects.toThrowError('Raiden instance was not initialized');
  });

  test('should resolve when channel open and deposit are successful', async () => {
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

  test('should return true and open channel open but skip deposit if balance is zero', async () => {
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

  test('should throw an exception when channel open fails', async () => {
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

  test('should throw an exception when the deposit fails', async () => {
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

  test('should return a token object from getTokenBalance if everything is good', async () => {
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

  test('should start updating channels in store on connect', async () => {
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

  test('should resolve successfully on channel close', async () => {
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

  test('should throw an exception if close fails', async () => {
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

  test('should successfully resolve if deposit is successful', async () => {
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

  test('should throw if deposit failed', async () => {
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
    test('should resolve when settle succeeds', async () => {
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

    test('should throw if the settle fails', async () => {
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

    test('successful connect should create token placeholders', async () => {
      const mockStore = store as any;

      mockStore.state = {
        tokens: tokens
      };

      await raidenService.connect();
      await flushPromises();

      expect(store.commit).toHaveBeenNthCalledWith(1, 'account', '123');
      expect(store.commit).toHaveBeenNthCalledWith(2, 'balance', '0.0');
      expect(store.commit).toHaveBeenNthCalledWith(3, 'network', undefined);
      expect(store.commit).toHaveBeenNthCalledWith(4, 'loadComplete');
      expect(store.commit).toHaveBeenCalledTimes(4);
    });

    test('fetch should fetch contracts that are not cached', async () => {
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

    test('check connected token balances on a new block', async () => {
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
  });

  test('shutdown and stop raiden', async () => {
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

  test('store should be notified when factory fails', async () => {
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
    test('should resolve when transfer succeeds', async () => {
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

    test('should throw if the transfer fails', async () => {
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

  test('resolve ens addresses', async () => {
    const resolveName = jest.fn().mockResolvedValue(AddressZero);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ resolveName }));

    await raidenService.connect();
    await flushPromises();

    expect(await raidenService.ensResolve('domain.eth')).toEqual(AddressZero);
    expect(resolveName).toHaveBeenCalledTimes(1);
  });

  test('get PFS list', async () => {
    const findPFS = jest.fn().mockResolvedValueOnce([]);
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ findPFS }));
    await raidenService.connect();
    await flushPromises();
    await expect(raidenService.fetchServices()).resolves.toEqual([]);
  });

  test('get PFS list fails', async () => {
    const findPFS = jest.fn().mockRejectedValue(new Error('failed'));
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden({ findPFS }));
    await raidenService.connect();
    await flushPromises();
    await expect(raidenService.fetchServices()).rejects.toBeInstanceOf(
      PFSRequestFailed
    );
  });

  test('find routes: no availability', async () => {
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

  test('find routes: no routes', async () => {
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

  test('find routes: success', async () => {
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
