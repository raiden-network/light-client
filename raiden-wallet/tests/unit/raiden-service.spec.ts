jest.mock('vuex');

import { TestData } from './data/mock-data';
import RaidenService, {
  ChannelCloseFailed,
  ChannelDepositFailed,
  ChannelOpenFailed,
  ChannelSettleFailed
} from '@/services/raiden-service';
import { Web3Provider } from '@/services/web3-provider';
import Vuex, { Store } from 'vuex';
import { RootState, Tokens } from '@/types';
import flushPromises from 'flush-promises';
import { Raiden } from 'raiden';
import Vue from 'vue';
import { BigNumber } from 'ethers/utils';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { Zero } from 'ethers/constants';
import Mocked = jest.Mocked;

Vue.use(Vuex);

describe('RaidenService', () => {
  let raidenService: RaidenService;
  let store: Mocked<Store<RootState>>;
  let providerMock: jest.Mock<any, any>;
  let factory: jest.Mock<any, any>;
  const mockProvider = {
    send: jest.fn(),
    sendAsync: jest.fn()
  };

  const mockRaiden = (extras: {} = {}) =>
    Object.assign(
      {
        address: '123',
        getBalance: jest.fn().mockResolvedValue(Zero),
        channels$: EMPTY,
        getTokenBalance: jest.fn().mockResolvedValue(Zero)
      },
      extras
    );

  beforeEach(() => {
    factory = Raiden.create = jest.fn();
    providerMock = Web3Provider.provider = jest.fn();
    store = new Store({}) as Mocked<Store<RootState>>;
    store.commit = jest.fn();
    raidenService = new RaidenService(store);
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  it('should throw an error if raiden is not initialized when calling getAccount', async () => {
    expect.assertions(1);
    await expect(raidenService.getAccount()).rejects.toThrowError(
      'Raiden instance was not initialized'
    );
  });

  it('should return the account after raiden is initialized', async () => {
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(mockRaiden());
    await raidenService.connect();
    await flushPromises();
    expect(await raidenService.getAccount()).toBe('123');
  });

  it('should commit a deniedAccess when the provider access is denied', async () => {
    providerMock.mockRejectedValue('denied');

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith('deniedAccess');
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  it('should commit an noProvider when there is no provider detected', async () => {
    providerMock.mockResolvedValue(null);

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith('noProvider');
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  it('should throw an error when attempting to open a channel before connecting', async () => {
    expect.assertions(1);
    await expect(
      raidenService.openChannel('0xaddr', '0xhub', new BigNumber(5000))
    ).rejects.toThrowError('Raiden instance was not initialized');
  });

  it('should resolve when channel open and deposit are successful', async function() {
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

  it('should return true and open channel open but skip deposit if balance is zero', async function() {
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

  it('should throw an exception when channel open fails', async function() {
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

  it('should throw an exception when the deposit fails', async function() {
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

  it('should return null from getTokenBalance if there is an exception', async function() {
    providerMock.mockResolvedValue(mockProvider);
    const raidenMock = {
      channels$: EMPTY,
      getBalance: jest.fn().mockResolvedValue(Zero),
      getTokenBalance: jest.fn().mockRejectedValue('reject'),
      getTokenInfo: jest.fn().mockRejectedValue('reject')
    };

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const result = await raidenService.getToken('0xtoken');
    expect(result).toBeNull();
    expect(raidenMock.getTokenBalance).toHaveBeenCalledTimes(1);
    expect(raidenMock.getTokenBalance).toHaveBeenCalledWith('0xtoken');
    expect(raidenMock.getTokenInfo).toHaveBeenCalledTimes(1);
    expect(raidenMock.getTokenInfo).toHaveBeenCalledWith('0xtoken');
  });

  it('should return a token object from getTokenBalance if everything is good', async function() {
    providerMock.mockResolvedValue(mockProvider);
    const balance = new BigNumber('1000000000000000000');
    const tokenBalance = jest.fn().mockResolvedValue(balance);
    const tokenInfo = jest.fn().mockResolvedValue({
      decimals: 18
    });
    const raidenMock = mockRaiden({
      getTokenBalance: tokenBalance,
      getTokenInfo: tokenInfo
    });

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const result = await raidenService.getToken('0xtoken');
    expect(result).toBeDefined();
    expect(result!!.decimals).toBe(18);
    expect(result!!.address).toBe('0xtoken');
    expect(result!!.units).toBe('1.0');
    expect(result!!.balance).toBe(balance);
    expect(tokenBalance).toHaveBeenCalledTimes(1);
    expect(tokenBalance).toHaveBeenCalledWith('0xtoken');
    expect(tokenInfo).toHaveBeenCalledTimes(1);
    expect(tokenInfo).toHaveBeenCalledWith('0xtoken');
  });

  it('should start updating channels in store on connect', async function() {
    raidenService.disconnect();
    providerMock.mockResolvedValue({
      send: jest.fn(),
      sendAsync: jest.fn()
    });
    const stub = new BehaviorSubject({});
    const raidenMock = {
      channels$: stub,
      getBalance: jest.fn().mockResolvedValue(Zero)
    };

    factory.mockResolvedValue(raidenMock);
    stub.next({});
    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toHaveBeenNthCalledWith(3, 'updateChannels', {});
    expect(store.commit).toHaveBeenCalledTimes(4);
    raidenService.disconnect();
  });

  it('should resolve successfully on channel close', async function() {
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

  it('should throw an exception if close fails', async function() {
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

  it('should successfully resolve if deposit is successful', async function() {
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

  it('should throw if deposit failed', async function() {
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

  describe('settleChannel', function() {
    it('should resolve when settle succeeds', async function() {
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

    it('should throw if the settle fails', async function() {
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

  describe('leaveNetwork', function() {
    beforeEach(() => {
      Object.defineProperty(store, 'getters', {
        get: jest.fn().mockReturnValue({
          channels: jest
            .fn()
            .mockReturnValue([TestData.openChannel, TestData.settlingChannel])
        })
      });

      providerMock.mockResolvedValue(mockProvider);
    });

    it('should attempt to close the channels but it will fail and return the result', async function() {
      expect.assertions(2);
      const closeChannel = jest.fn().mockRejectedValue(new Error('txfailed'));

      factory.mockResolvedValue(
        mockRaiden({
          closeChannel
        })
      );

      await raidenService.connect();
      await flushPromises();

      await expect(raidenService.leaveNetwork('0xtoken')).resolves.toEqual({
        closed: 0,
        failed: 2
      });
      expect(closeChannel).toHaveBeenCalledTimes(2);
    });

    it('should attempt to close the channels and it will succeed returning the result', async function() {
      expect.assertions(5);
      const closeChannel = jest.fn().mockResolvedValue('0xtxhash');

      factory.mockResolvedValue(
        mockRaiden({
          closeChannel
        })
      );

      await raidenService.connect();
      await flushPromises();

      const progress = jest.fn();
      await expect(
        raidenService.leaveNetwork('0xtoken', progress)
      ).resolves.toEqual({
        closed: 2,
        failed: 0
      });
      expect(closeChannel).toHaveBeenCalledTimes(2);
      expect(progress).toHaveBeenCalledTimes(2);
      expect(progress).toHaveBeenNthCalledWith(1, { current: 1, total: 2 });
      expect(progress).toHaveBeenLastCalledWith({ current: 2, total: 2 });
    });
  });

  describe('token caching', function() {
    const mockToken1 = '0xtoken1';
    const mockToken2 = '0xtoken2';

    const mockToken = (address: string) => ({
      address: address,
      balance: Zero,
      units: '0.0',
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
          getTokenInfo
        })
      );
    });

    test('fetch should skip already cached tokens', async () => {
      // @ts-ignore
      store.state = {
        tokens: tokens
      };

      await raidenService.connect();
      await flushPromises();

      await expect(raidenService.fetchTokens()).resolves.toBeUndefined();

      expect(store.commit).toHaveBeenCalledTimes(3);

      expect(store.commit).toHaveBeenNthCalledWith(1, 'account', '123');
      expect(store.commit).toHaveBeenNthCalledWith(2, 'balance', '0.0');
      expect(store.commit).toHaveBeenNthCalledWith(3, 'loadComplete');
    });

    test('fetch should fetch contracts that are not cached', async () => {
      // @ts-ignore
      store.state = {
        tokens: {}
      };

      await raidenService.connect();
      await flushPromises();

      await expect(raidenService.fetchTokens()).resolves.toBeUndefined();

      expect(store.commit).toHaveBeenCalledTimes(4);

      expect(store.commit).toHaveBeenNthCalledWith(1, 'account', '123');
      expect(store.commit).toHaveBeenNthCalledWith(2, 'balance', '0.0');
      expect(store.commit).toHaveBeenNthCalledWith(3, 'loadComplete');
      expect(store.commit).toHaveBeenNthCalledWith(4, 'updateTokens', tokens);
    });
  });
});
