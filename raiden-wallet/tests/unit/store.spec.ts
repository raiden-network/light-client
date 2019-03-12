import store from '@/store';

describe('store', () => {
  beforeEach(() => {
    store.replaceState({
      loading: true,
      defaultAccount: '',
      accountBalance: '0.0',
      providerDetected: true,
      userDenied: false,
      channels: {}
    });
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
});
