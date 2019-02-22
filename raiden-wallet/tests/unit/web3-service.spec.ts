import Web3Service, { ProviderState } from '@/services/web3-service';
import Web3 from 'web3';
import { HttpProvider } from 'web3-providers/types';

describe('Web3Service', () => {
  let web3: Web3Service;

  beforeEach(() => {
    web3 = new Web3Service();
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  it('should return NO_PROVIDER when no provider is detected', async function() {
    const status = await web3.detectProvider();
    expect(status).toBe(ProviderState.NO_PROVIDER);
  });

  it('should return DENIED_ACCESS when the user denies access to the provider', async function() {
    window.ethereum = {
      enable: jest.fn().mockRejectedValue('denied')
    };

    const status = await web3.detectProvider();
    expect(status).toBe(ProviderState.DENIED_ACCESS);
  });

  it('should return INITIALIZED after the user allows connection to the provider', async function() {
    window.ethereum = {
      enable: jest.fn().mockResolvedValue(true)
    };

    const status = await web3.detectProvider();
    expect(status).toBe(ProviderState.INITIALIZED);
  });

  it('should check for legacy web3 providers', async function() {
    window.web3 = {
      currentProvider: new Web3.providers.HttpProvider('http://localhost:8091')
    };

    const status = await web3.detectProvider();
    expect(status).toBe(ProviderState.INITIALIZED);
  });

  it('should throw an error if web3 is not initialized when calling getAccount', async function() {
    try {
      await web3.getAccount();
      fail('function was supposed to throw an exception');
    } catch (e) {
      expect(e.message).toContain('Web3 instance was not initialized');
    }
  });

  it('should return an empty string if no accounts are found', async function() {
    const provider: HttpProvider = {
      connected: false,
      host: '',
      disconnect: jest.fn(),
      send: jest.fn().mockResolvedValue([]),
      sendBatch: jest.fn()
    };

    window.web3 = {
      currentProvider: provider
    };
    await web3.detectProvider();
    expect(await web3.getAccount()).toBe('');
  });

  it('should return an address if an address is found', async function() {
    const provider: HttpProvider = {
      connected: false,
      host: '',
      disconnect: jest.fn(),
      send: jest
        .fn()
        .mockResolvedValue(['0x82641569b2062B545431cF6D7F0A418582865ba7']),
      sendBatch: jest.fn()
    };

    window.web3 = {
      currentProvider: provider
    };
    await web3.detectProvider();
    expect(await web3.getAccount()).toBe(
      '0x82641569b2062B545431cF6D7F0A418582865ba7'
    );
  });

  it('should return the first address if an addresses are found', async function() {
    const provider: HttpProvider = {
      connected: false,
      host: '',
      disconnect: jest.fn(),
      send: jest
        .fn()
        .mockResolvedValue([
          '0x82641569b2062B545431cF6D7F0A418582865ba7',
          '0x0E809A051034723beE67871a5A4968aE22d36C5A'
        ]),
      sendBatch: jest.fn()
    };

    window.web3 = {
      currentProvider: provider
    };
    await web3.detectProvider();
    expect(await web3.getAccount()).toBe(
      '0x82641569b2062B545431cF6D7F0A418582865ba7'
    );
  });
});
