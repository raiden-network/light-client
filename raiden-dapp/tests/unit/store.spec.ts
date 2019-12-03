import store, { defaultState } from '@/store/index';
import { TestData } from './data/mock-data';
import { DeniedReason, emptyTokenModel, Token } from '@/model/types';
import { Tokens } from '@/types';
import { Zero } from 'ethers/constants';
import { BigNumber } from 'ethers/utils';

describe('store', () => {
  const testTokens = (token: string, name?: string, symbol?: string) => {
    const tokens: Tokens = {};
    tokens[token] = {
      address: token,
      balance: Zero,
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

  test('loadComplete mutation changes the loading state', () => {
    expect(store.state.loading).toBe(true);
    store.commit('loadComplete');
    expect(store.state.loading).toBe(false);
  });

  test('noProvider mutation changes the providerDetected state', () => {
    expect(store.state.providerDetected).toBe(true);
    store.commit('noProvider');
    expect(store.state.providerDetected).toBe(false);
  });

  test('balance mutation changes the accountBalance state', () => {
    expect(store.state.accountBalance).toBe('0.0');
    store.commit('balance', '12.0');
    expect(store.state.accountBalance).toBe('12.0');
  });

  test('account mutation changes the defaultAccount state', () => {
    expect(store.state.defaultAccount).toBe('');
    store.commit('account', 'test');
    expect(store.state.defaultAccount).toBe('test');
  });

  test('accessDenied mutation changes the accessDenied state', () => {
    expect(store.state.accessDenied).toBe(DeniedReason.UNDEFINED);
    store.commit('accessDenied', DeniedReason.NO_ACCOUNT);
    expect(store.state.accessDenied).toBe(DeniedReason.NO_ACCOUNT);
  });

  test('updateChannel mutation changes the channels state', () => {
    expect(store.state.channels).toEqual({});
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.state.channels).toEqual(TestData.mockChannels);
  });

  test('the tokens getter returns tokens that have channels', () => {
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model()]);
  });

  test('the channels getter returns an empty array when there are no channels', () => {
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.channels('0xNoAddress')).toEqual([]);
  });

  test('the channels getter returns an array of channels', () => {
    store.commit('updateChannels', TestData.mockChannels);
    expect(
      store.getters.channels('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toEqual([TestData.openChannel, TestData.settlingChannel]);
  });

  test('updateTokens mutation updates the tokens', () => {
    const tokens = testTokens('0xtoken');
    store.commit('updateTokens', tokens);
    expect(store.state.tokens).toEqual(tokens);
  });

  test('the tokens getters returns tokens with empty strings when there is no name and symbol', () => {
    const tokens = testTokens('0xd0A1E359811322d97991E03f863a0C30C2cF029C');
    store.commit('updateTokens', tokens);
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model()]);
  });

  test('the tokens getter returns tokens that include name and symbol information', () => {
    const tokens = testTokens(
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
      'Test Token',
      'TTT'
    );

    store.commit('updateTokens', tokens);
    store.commit('updateChannels', TestData.mockChannels);
    expect(store.getters.tokens).toEqual([model('Test Token', 'TTT')]);
  });

  test('the allTokens getter returns the cached tokens as an array', () => {
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
        symbol: 'TTT',
        name: 'Test Token'
      }
    ]);
  });

  test('the token getter returns null when the token is not cached', () => {
    expect(
      store.getters.token('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toBeNull();
  });

  test('the token getter returns the token when it is cached', () => {
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
      symbol: 'TTT',
      name: 'Test Token'
    } as Token);
  });

  test('the network getter returns "Chain x" when there is no chain name', () => {
    store.commit('network', { name: '', chainId: 89 });
    expect(store.getters.network).toEqual('Chain 89');
  });

  test('the network getter returns the chain name when it exists', () => {
    store.commit('network', { name: 'Testnet', chainId: 89 });
    expect(store.getters.network).toEqual('Testnet');
  });

  test('the reset mutation resets the state', () => {
    store.commit('loadComplete', false);
    expect(store.state.loading).toBe(false);
    store.commit('reset');
    expect(store.state.loading).toBe(true);
  });

  describe('channelWithBiggestCapacity', () => {
    test('return the open channel when there is only one open channel', () => {
      let mockChannels = TestData.mockChannels;
      store.commit('updateChannels', mockChannels);
      expect(
        store.getters.channelWithBiggestCapacity(
          '0xd0A1E359811322d97991E03f863a0C30C2cF029C'
        )
      ).toEqual(TestData.openChannel);
    });

    test('return undefined when there are no channels', () => {
      expect(
        store.getters.channelWithBiggestCapacity(
          '0xd0A1E359811322d97991E03f863a0C30C2cF029C'
        )
      ).toBeUndefined();
    });

    test('return the channel with the biggest capacity when there are multiple channels open', () => {
      const biggestChannel = {
        ...TestData.openChannel,
        capacity: new BigNumber(20 ** 8),
        partner: '0xaDBa6B0CC7176De032A887232EB59Bb3B1402103'
      };
      const mockChannels = {
        '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {
          '0x1D36124C90f53d491b6832F1c073F43E2550E35b': TestData.openChannel,
          '0x82641569b2062B545431cF6D7F0A418582865ba7':
            TestData.settlingChannel,
          '0xaDBa6B0CC7176De032A887232EB59Bb3B1402103': biggestChannel
        }
      };
      store.commit('updateChannels', mockChannels);
      expect(
        store.getters.channelWithBiggestCapacity(
          '0xd0A1E359811322d97991E03f863a0C30C2cF029C'
        )
      ).toEqual(biggestChannel);
    });
  });

  test('the channels getter returns an empty array when the token has no channels', () => {
    const channels = {
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {}
    };
    store.commit('updateChannels', channels);
    expect(
      store.getters.channels('0xd0A1E359811322d97991E03f863a0C30C2cF029C')
    ).toEqual([]);
  });

  test('the token getter returns an empty array when the token has no channels ', () => {
    const channels = {
      '0xd0A1E359811322d97991E03f863a0C30C2cF029C': {}
    };
    store.commit('updateChannels', channels);
    expect(store.getters.tokens).toEqual([]);
  });
});
