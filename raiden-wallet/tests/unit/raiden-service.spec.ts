import RaidenService from '@/services/raiden-service';
import { Web3Provider } from '@/services/web3-provider';
import Vuex, { Store } from 'vuex';
import { RootState } from '@/types';
import flushPromises from 'flush-promises';
import { Raiden } from 'raiden';
import Vue from 'vue';
import { of } from 'rxjs/observable/of';

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

  it('should start the state monitoring when connected', async () => {
    providerMock.mockResolvedValue({});
    factory.mockResolvedValue({
      state$: of({
        address: '123'
      })
    });

    raidenService.disconnect();

    await raidenService.connect();
    await flushPromises();

    raidenService.disconnect();

    expect(store.commit).toBeCalledWith('account', '123');
  });

  it('should throw an error when attempting to open a channel before connecting', async () => {
    try {
      await raidenService.openChannel('0xaddr', '0xhub', 10);
      fail('function was supposed to throw an exception');
    } catch (e) {
      expect(e.message).toContain('Raiden instance was not initialized');
    }
  });
});
