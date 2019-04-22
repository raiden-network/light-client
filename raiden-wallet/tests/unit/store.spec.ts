import store, { defaultState } from '@/store';
import { TestData } from './data/mock-data';
import { emptyTokenModel } from '@/model/types';
import { Tokens } from '@/types';
import { Zero } from 'ethers/constants';

describe('store', () => {
  const testTokens = (token: string, name?: string, symbol?: string) => {
    const tokens: Tokens = {};
    tokens[token] = {
      totalSupply: Zero,
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
});
