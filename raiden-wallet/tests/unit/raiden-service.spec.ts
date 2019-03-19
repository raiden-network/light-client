import RaidenService, { OpenChannelFailed } from '@/services/raiden-service';
import { Web3Provider } from '@/services/web3-provider';
import Vuex, { Store } from 'vuex';
import { RootState } from '@/types';
import flushPromises from 'flush-promises';
import { Raiden } from 'raiden';
import Vue from 'vue';
import { BigNumber } from 'ethers/utils';
import { EMPTY } from 'rxjs';

Vue.use(Vuex);

describe('RaidenService', () => {
  let raidenService: RaidenService;
  let store: Store<RootState>;
  let providerMock: jest.Mock<any, any>;
  let factory: jest.Mock<any, any>;

  beforeEach(() => {
    factory = Raiden.create = jest.fn();
    providerMock = Web3Provider.provider = jest.fn();
    store = new Store({});
    store.commit = jest.fn();
    raidenService = new RaidenService(store);
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  it('should throw an error if raiden is not initialized when calling getAccount', async () => {
    try {
      await raidenService.getAccount();
      fail('function was supposed to throw an exception');
    } catch (e) {
      expect(e.message).toContain('Raiden instance was not initialized');
    }
  });

  it('should return the account after raiden is initialized', async () => {
    providerMock.mockResolvedValue({});
    factory.mockResolvedValue({
      address: '123'
    });
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
    try {
      await raidenService.openChannel('0xaddr', '0xhub', new BigNumber(5000));
      fail('function was supposed to throw an exception');
    } catch (e) {
      expect(e.message).toContain('Raiden instance was not initialized');
    }
  });

  it('should return true when channel open and deposit are successful', async function() {
    providerMock.mockResolvedValue({});
    const raidenMock = {
      channels$: EMPTY,
      getBalance: jest.fn().mockResolvedValue(new BigNumber(0)),
      openChannel: jest.fn().mockResolvedValue('0xtxhash'),
      depositChannel: jest.fn().mockResolvedValue('0xtxhash')
    };
    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(100);
    const result = await raidenService.openChannel(
      '0xtoken',
      '0xpartner',
      depositAmount
    );
    expect(result).toBe(true);
    expect(raidenMock.openChannel).toBeCalledTimes(1);
    expect(raidenMock.openChannel).toBeCalledWith('0xtoken', '0xpartner');
    expect(raidenMock.depositChannel).toBeCalledTimes(1);
    expect(raidenMock.depositChannel).toBeCalledWith(
      '0xtoken',
      '0xpartner',
      depositAmount
    );
  });

  it('should throw an exception when channel open fails', async function() {
    providerMock.mockResolvedValue({});
    const raidenMock = {
      channels$: EMPTY,
      getBalance: jest.fn().mockResolvedValue(new BigNumber(0)),
      openChannel: jest.fn().mockRejectedValue('failed'),
      depositChannel: jest.fn().mockResolvedValue('0xtxhash')
    };

    factory.mockResolvedValue(raidenMock);
    await raidenService.connect();
    await flushPromises();

    const depositAmount = new BigNumber(100);
    try {
      await raidenService.openChannel('0xtoken', '0xpartner', depositAmount);
      fail('This path should be no-op');
    } catch (e) {
      expect(e).toBeInstanceOf(OpenChannelFailed);
    }
  });
});
