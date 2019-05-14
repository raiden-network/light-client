import store, { defaultState } from '@/store';
import { TestData } from './data/mock-data';
import { DeniedReason, emptyTokenModel } from '@/model/types';
import { Tokens } from '@/types';
import { Zero } from 'ethers/constants';

describe('store', () => {
  const testTokens = (token: string, name?: string, symbol?: string) => {
    const tokens: Tokens = {};
    tokens[token] = {
      address: token,
      balance: Zero,
      units: '',
      decimals: 18,
      name,
      symbol
    };
    return tokens;
  };

  const model = (name?: string, symbol?: string) => {
    const model = emptyTokenModel();
    model.address = TestData.openChannel.token;
    model.open = 1;
    model.settling = 1;
    model.name = name || '';
    model.symbol = symbol || '';
    return model;
  };

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

  it('should change the accessDenied state after an accessDenied mutation', function() {
    expect(store.state.accessDenied).toBe(DeniedReason.UNDEFINED);
    store.commit('accessDenied', DeniedReason.USER_DENIED);
    expect(store.state.accessDenied).toBe(DeniedReason.USER_DENIED);
  });

  it('should change the channel state after an updateChannel mutation', function() {
    expect(store.state.channels).toEqual({});
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.state.channels).toEqual(TestData.mockChannels);
  });

  it('should return a list of open channels and tokens', function() {
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model()]);
  });

  it('should return an empty list if token is not found', function() {
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.channels('0xNoAddress')).toEqual([]);
  });

  it('should return two channels for token', function() {
    store.commit('updateChannels', TestData.mockChannels);
    expect(
      store.getters.channels('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toEqual([TestData.openChannel, TestData.settlingChannel]);
  });

  it('should change the tokens state when a updateTokens mutation is committed', function() {
    const tokens = testTokens('0xtoken');
    store.commit('updateTokens', tokens);
    expect(store.state.tokens).toEqual(tokens);
  });

  it('should have empty strings if name and symbol are undefined', function() {
    const tokens = testTokens('0xd0A1E359811322d97991E03f863a0C30C2cF029C');
    store.commit('updateTokens', tokens);
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model()]);
  });

  it('should have name and symbol information', function() {
    const tokens = testTokens(
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      'Test Token',
      'TTT'
    );

    store.commit('updateTokens', tokens);
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model('Test Token', 'TTT')]);
  });

  test('return the cached tokens as an array', function() {
    const tokens = testTokens(
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      'Test Token',
      'TTT'
    );

    store.commit('updateTokens', tokens);
    expect(store.getters.allTokens).toEqual([
      {
        address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
        balance: Zero,
        decimals: 18,
        units: '',
        symbol: 'TTT',
        name: 'Test Token'
      }
    ]);
  });

  test('return null if a token is not cached', () => {
    expect(
      store.getters.token('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toBeNull();
  });

  test('return the token if it is cached', () => {
    const tokens = testTokens(
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      'Test Token',
      'TTT'
    );

    store.commit('updateTokens', tokens);
    expect(
      store.getters.token('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toEqual({
      address: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      balance: Zero,
      decimals: 18,
      units: '',
      symbol: 'TTT',
      name: 'Test Token'
    });
  });

  test('chain without a name returns chain id', () => {
    store.commit('network', { name: '', chainId: 89 });
    expect(store.getters.network).toEqual('Chain 89');
  });

  test('chain with a name returns chain id', () => {
    store.commit('network', { name: 'Testnet', chainId: 89 });
    expect(store.getters.network).toEqual('Testnet');
  });

  test('state should reset when reset mutation is commited', () => {
    store.commit('loadComplete', false);
    expect(store.state.loading).toBe(false);
    store.commit('reset');
    expect(store.state.loading).toBe(true);
  });
});
