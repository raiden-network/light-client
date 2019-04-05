import store, { defaultState } from '@/store';
import { TestData } from './data/mock-data';
import { createEmptyTokenModel } from '@/model/token';

describe('store', () => {
  beforeEach(() => {
    store.replaceState(defaultState());
  });

  it('should change the loading state after a loadComplete mutation', function() {
    expect(store.state.loading).toBe(true);
    store.commit('loadComplete');
    expect(store.state.loading).toBe(false);
  });

  it('should change the providerDetected state after a noProvider mutation', function() {
    expect(store.state.providerDetected).toBe(true);
    store.commit('noProvider');
    expect(store.state.providerDetected).toBe(false);
  });

  it('should change the accountBalance state after a balance mutation', function() {
    expect(store.state.accountBalance).toBe('0.0');
    store.commit('balance', '12.0');
    expect(store.state.accountBalance).toBe('12.0');
  });

  it('should change the defaultAccount state after a account mutation', function() {
    expect(store.state.defaultAccount).toBe('');
    store.commit('account', 'test');
    expect(store.state.defaultAccount).toBe('test');
  });

  it('should change the userDenied state after an deniedAccess mutation', function() {
    expect(store.state.userDenied).toBe(false);
    store.commit('deniedAccess');
    expect(store.state.userDenied).toBe(true);
  });

  it('should change the channel state after an updateChannel mutation', function() {
    expect(store.state.channels).toEqual({});
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.state.channels).toEqual(TestData.mockChannels);
  });

  it('should return a list of open channels and tokens', function() {
    store.commit('updateChannels', TestData.mockChannels);
    const model = createEmptyTokenModel();
    model.address = TestData.mockChannel1.token;
    model.open = 2;
    expect(store.getters.tokens).toEqual([model]);
  });
});
