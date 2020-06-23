jest.mock('vuex');
jest.mock('raiden-ts');
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: jest.fn(args => args.toString())
  }
}));

import { DeniedReason, Token, TokenModel } from '@/model/types';
import RaidenService from '@/services/raiden-service';
import { Web3Provider } from '@/services/web3-provider';
import { Store } from 'vuex';
import { RootState, Tokens } from '@/types';
import flushPromises from 'flush-promises';
import { Address, Hash, Raiden, RaidenTransfer } from 'raiden-ts';
import { BigNumber, bigNumberify, parseEther } from 'ethers/utils';
import { BehaviorSubject, EMPTY, of } from 'rxjs';
import { delay } from 'rxjs/internal/operators';
import { AddressZero, One, Zero } from 'ethers/constants';
import { paymentId } from './data/mock-data';
import Mocked = jest.Mocked;
const { RaidenError, ErrorCodes, Capabilities } = jest.requireActual(
  'raiden-ts'
);

describe('RaidenService', () => {
  let raidenService: RaidenService;
  let raiden: Mocked<Raiden>;
  let store: Mocked<Store<RootState>>;
  let providerMock: jest.Mock;
  let factory: jest.Mock;
  const mockProvider = {
    send: jest.fn(),
    sendAsync: jest.fn()
  };
  const path = [{ path: ['0xmediator'], fee: new BigNumber(1 ** 10) }];

  const setupMock = (mock: jest.Mocked<Raiden>) => {
    mock.getBalance.mockResolvedValue(Zero);
    mock.getTokenBalance.mockResolvedValue(Zero);
    mock.getTokenList.mockResolvedValue(['0xtoken' as Address]);
    mock.getUDCCapacity.mockResolvedValue(Zero);
    mock.userDepositTokenAddress = jest
      .fn()
      .mockResolvedValue('0xuserdeposittoken' as Address);
    mock.getAvailability.mockResolvedValue({
      userId: '123',
      available: true,
      ts: 0
    });

    const raidenMock = mock as any;
    raidenMock.address = '123';
    raidenMock.channels$ = EMPTY;
    raidenMock.events$ = EMPTY;
    raidenMock.config$ = EMPTY;
    // Emit a dummy transfer event every time raiden is mocked
    raidenMock.transfers$ = of({}).pipe(delay(1000));
  };

  async function setupSDK(stateBackup?: string, subkey?: true) {
    providerMock.mockResolvedValue(mockProvider);
    factory.mockResolvedValue(raiden);
    await raidenService.connect(stateBackup, subkey);
    await flushPromises();
  }

  beforeEach(() => {
    // @ts-ignore
    raiden = new Raiden() as jest.Mocked<Raiden>;
    setupMock(raiden);
    factory = Raiden.create = jest.fn();
    providerMock = Web3Provider.provider = jest.fn();
    store = new Store({}) as Mocked<Store<RootState>>;
    raidenService = new RaidenService(store);
  });

  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  test('throw an error when the user calls getAccount before connecting', async () => {
    expect.assertions(1);
    await expect(raidenService.getAccount()).rejects.toThrowError(
      'Raiden instance was not initialized'
    );
  });

  test('raidenAccountBalance should be fetched when subkey is used', async () => {
    raiden.getBalance = jest
      .fn()
      .mockResolvedValueOnce(bigNumberify('1000000000000000000'))
      .mockResolvedValueOnce(bigNumberify('100000000000000000'));

    await setupSDK('', true);
    expect(store.commit).toBeCalledWith('balance', '1.0');
    expect(store.commit).toBeCalledWith('raidenAccountBalance', '0.1');
  });

  test('commit a deniedAccess when the throws a denied access error', async () => {
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

  test('commit a deniedAccess when the user attempts to connect on an unsupported network', async () => {
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

  test('commit an noProvider when there is no provider detected', async () => {
    providerMock.mockResolvedValue(null);

    await raidenService.connect();
    await flushPromises();

    expect(store.commit).toBeCalledTimes(2);
    expect(store.commit).toBeCalledWith('noProvider');
    expect(store.commit).toBeCalledWith('loadComplete');
  });

  test('throw an error when the user calls openChannel before calling connect', async () => {
    expect.assertions(1);
    await expect(
      raidenService.openChannel('0xaddr', '0xhub', new BigNumber(5000))
    ).rejects.toThrowError('Raiden instance was not initialized');
  });

  describe('after sdk is initialized', () => {
    beforeEach(async () => {
      await setupSDK();
    });

    test('return a token object from getTokenBalance when there is no exception', async () => {
      const balance = new BigNumber('1000000000000000000');

      raiden.getTokenBalance = jest.fn().mockResolvedValue(balance);
      raiden.getTokenInfo = jest.fn().mockResolvedValue({
        decimals: 18,
        name: 'Test Token 1',
        symbol: 'TT1',
        totalSupply: bigNumberify(1221)
      });

      await raidenService.fetchTokenData(['0xtoken']);
      expect(store.commit).toHaveBeenCalledWith(
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
      expect(raiden.getTokenBalance).toHaveBeenCalledTimes(1);
      expect(raiden.getTokenBalance).toHaveBeenCalledWith('0xtoken');
      expect(raiden.getTokenInfo).toHaveBeenCalledTimes(1);
      expect(raiden.getTokenInfo).toHaveBeenCalledWith('0xtoken');
    });

    test('return the account when the sdk is connected', async () => {
      expect(await raidenService.getAccount()).toBe('123');
    });

    test('resolves when channel open and deposit are successful', async () => {
      // @ts-ignore
      raiden.openChannel = jest.fn(async ({}, {}, {}, callback?: Function) => {
        callback?.({ type: 'OPENED', payload: { txHash: '0xtxhash' } });
        return '0xtxhash';
      });

      const progress = jest.fn();

      const depositAmount = new BigNumber(100);
      await expect(
        raidenService.openChannel(
          '0xtoken',
          '0xpartner',
          depositAmount,
          progress
        )
      ).resolves.toBeUndefined();
      expect(raiden.openChannel).toBeCalledTimes(1);
      expect(raiden.openChannel).toBeCalledWith(
        '0xtoken',
        '0xpartner',
        { deposit: expect.any(BigNumber) },
        expect.any(Function)
      );

      expect(progress).toHaveBeenCalled();
    });

    test('throw an exception when channel open fails', async () => {
      expect.assertions(1);
      const error = new RaidenError(ErrorCodes.CNL_OPENCHANNEL_FAILED);
      raiden.openChannel = jest.fn().mockRejectedValue(error);

      const depositAmount = new BigNumber(100);
      await expect(
        raidenService.openChannel('0xtoken', '0xpartner', depositAmount)
      ).rejects.toThrow(RaidenError);
    });

    test('call stop when disconnect is called', async () => {
      raidenService.disconnect();
      expect(raiden.stop).toHaveBeenCalledTimes(1);
      expect(raiden.start).toHaveBeenCalledTimes(1);
      expect(store.commit).toHaveBeenLastCalledWith('loadComplete');
    });

    test('resolves successfully when the channel closes', async () => {
      raiden.closeChannel.mockResolvedValue('0xthash' as Hash);
      await raidenService.closeChannel('0xtoken', '0xpartner');
      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(raiden.closeChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
    });

    test('throw an exception when close fails', async () => {
      expect.assertions(3);
      const error = new RaidenError(ErrorCodes.CNL_CLOSECHANNEL_FAILED);
      raiden.closeChannel.mockRejectedValue(error);

      await expect(
        raidenService.closeChannel('0xtoken', '0xpartner')
      ).rejects.toThrowError(RaidenError);
      expect(raiden.closeChannel).toHaveBeenCalledTimes(1);
      expect(raiden.closeChannel).toHaveBeenCalledWith('0xtoken', '0xpartner');
    });

    test('resolves when deposit is successful', async () => {
      expect.assertions(2);
      raiden.depositChannel.mockResolvedValue('0xtxhash' as Hash);

      const depositAmount = new BigNumber(6000);
      await raidenService.deposit('0xtoken', '0xpartner', depositAmount);
      expect(raiden.depositChannel).toHaveBeenCalledTimes(1);
      expect(raiden.depositChannel).toHaveBeenCalledWith(
        '0xtoken',
        '0xpartner',
        depositAmount
      );
    });

    test('throw when deposit fails', async () => {
      expect.assertions(3);
      const error = new RaidenError(ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED);
      raiden.depositChannel.mockRejectedValue(error);

      const depositAmount = new BigNumber(6000);
      await expect(
        raidenService.deposit('0xtoken', '0xpartner', depositAmount)
      ).rejects.toThrowError(RaidenError);
      expect(raiden.depositChannel).toHaveBeenCalledTimes(1);
      expect(raiden.depositChannel).toHaveBeenCalledWith(
        '0xtoken',
        '0xpartner',
        depositAmount
      );
    });

    describe('settleChannel', () => {
      test('resolves when settle is successful', async () => {
        raiden.settleChannel = jest.fn().mockResolvedValue('txhash' as Hash);
        await expect(
          raidenService.settleChannel('0xtoken', '0xpartner')
        ).resolves.toBeUndefined();
        expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
        expect(raiden.settleChannel).toHaveBeenCalledWith(
          '0xtoken',
          '0xpartner'
        );
      });

      test('throw when settle fails', async () => {
        const error = new RaidenError(ErrorCodes.CNL_SETTLECHANNEL_FAILED);
        raiden.settleChannel = jest.fn().mockRejectedValue(error);
        await expect(
          raidenService.settleChannel('0xtoken', '0xpartner')
        ).rejects.toThrowError(RaidenError);
        expect(raiden.settleChannel).toHaveBeenCalledTimes(1);
        expect(raiden.settleChannel).toHaveBeenCalledWith(
          '0xtoken',
          '0xpartner'
        );
      });
    });
    describe('transfer', () => {
      test('resolves when a transfer succeeds', async () => {
        raiden.waitTransfer.mockResolvedValue(One);

        await expect(
          raidenService.transfer('0xtoken', '0xpartner', One, path, paymentId)
        ).resolves.toBeUndefined();
        expect(raiden.transfer).toHaveBeenCalledTimes(1);
        expect(raiden.transfer).toHaveBeenCalledWith(
          '0xtoken',
          '0xpartner',
          One,
          {
            paths: path,
            paymentId
          }
        );
      });

      test('throw when a transfer fails', async () => {
        const error = new RaidenError(ErrorCodes.XFER_REFUNDED);
        raiden.waitTransfer.mockRejectedValue(error);

        await expect(
          raidenService.transfer('0xtoken', '0xpartner', One, path, paymentId)
        ).rejects.toThrow(RaidenError);
        expect(raiden.transfer).toHaveBeenCalledTimes(1);
        expect(raiden.transfer).toHaveBeenCalledWith(
          '0xtoken',
          '0xpartner',
          One,
          {
            paths: path,
            paymentId
          }
        );
      });
    });

    test('resolves an ens domain', async () => {
      (raiden as any).resolveName = jest
        .fn()
        .mockResolvedValue(AddressZero as Address);

      expect(await raidenService.ensResolve('domain.eth')).toEqual(AddressZero);
      expect(raiden.resolveName).toHaveBeenCalledTimes(1);
    });

    test('resolves a list of the available path-finding services', async () => {
      raiden.findPFS.mockResolvedValueOnce([]);
      await expect(raidenService.fetchServices()).resolves.toEqual([]);
    });

    test('rejects when there is an error while getting the available path-finding services', async () => {
      raiden.findPFS.mockRejectedValue(new Error('failed'));
      await expect(raidenService.fetchServices()).rejects.toBeInstanceOf(Error);
    });

    describe('findRoutes', () => {
      test('rejects when it cannot find routes: no availability', async () => {
        const raidenError = new RaidenError(ErrorCodes.PFS_TARGET_OFFLINE);
        raiden.getAvailability = jest.fn().mockRejectedValue(raidenError);

        await expect(
          raidenService.findRoutes(AddressZero, AddressZero, One)
        ).rejects.toEqual(raidenError);
      });

      test('rejects when it cannot find routes: no routes', async () => {
        const error = new Error('no path');
        raiden.getAvailability = jest.fn().mockResolvedValue(AddressZero);
        raiden.findRoutes = jest.fn().mockRejectedValue(error);

        await expect(
          raidenService.findRoutes(AddressZero, AddressZero, One)
        ).rejects.toEqual(error);
      });

      test('resolves when it can find routes', async () => {
        raiden.getAvailability = jest.fn().mockResolvedValueOnce(AddressZero);
        raiden.findRoutes = jest.fn().mockResolvedValueOnce([]);

        await expect(
          raidenService.findRoutes(AddressZero, AddressZero, One)
        ).resolves.toEqual([]);
      });
    });

    describe('availability', () => {
      test('returns true when target is online', async () => {
        raiden.getAvailability = jest
          .fn()
          .mockResolvedValue({ available: true });

        const isAvailable = await raidenService.getAvailability('0xtarget');
        expect(isAvailable).toBe(true);
        expect(raiden.getAvailability).toHaveBeenCalledTimes(1);
      });

      test('returns false when target is offline', async () => {
        raiden.getAvailability = jest.fn().mockRejectedValue({});

        const isAvailable = await raidenService.getAvailability('0xtarget');
        expect(isAvailable).toBe(false);
        expect(raiden.getAvailability).toHaveBeenCalledTimes(1);
        expect(store.commit).toBeCalledWith('updatePresence', {
          ['0xtarget']: false
        });
      });

      test('save transfers in store', async () => {
        const dummyTransfer = {
          initiator: '123',
          key: 'sent:0x1',
          completed: false
        };
        (raiden as any).transfers$ = new BehaviorSubject(dummyTransfer);
        providerMock.mockResolvedValue(mockProvider);
        factory.mockResolvedValue(raiden);

        await raidenService.connect();
        await flushPromises();

        expect(store.commit).toHaveBeenCalledWith(
          'updateTransfers',
          expect.objectContaining({
            ...dummyTransfer
          } as RaidenTransfer)
        );
      });
    });

    describe('raiden account balances', () => {
      beforeEach(async () => {
        providerMock.mockResolvedValue(mockProvider);
        const stub = new BehaviorSubject({});
        raiden.getTokenList = jest.fn().mockResolvedValue([]);
        factory.mockResolvedValue(raiden);
        stub.next({});
        await raidenService.connect();
      });

      test('empty list is returned if not subkey', async () => {
        await expect(
          raidenService.getRaidenAccountBalances()
        ).resolves.toStrictEqual([]);
      });

      describe('with tokens and subkey', () => {
        const createToken = (address: string) => ({
          address,
          name: address,
          symbol: address.toLocaleUpperCase(),
          decimals: 18,
          balance: Zero
        });

        beforeEach(() => {
          (raiden as any).mainAddress = '0x001';
          raiden.getTokenList = jest.fn().mockResolvedValue(['0x1', '0x2']);
        });

        test('return empty list if no balances are found', async () => {
          await expect(
            raidenService.getRaidenAccountBalances()
          ).resolves.toStrictEqual([]);
        });

        describe('with balances', () => {
          const tokens = [
            {
              ...createToken('0x1'),
              balance: One
            },
            {
              ...createToken('0x2'),
              balance: One
            }
          ];

          beforeEach(() => {
            raiden.getTokenBalance = jest.fn().mockResolvedValue(One);
            raiden.getTokenInfo = jest
              .fn()
              .mockImplementation(async (address: string) =>
                createToken(address)
              );
          });

          test('load from chain if no token info is cached', async () => {
            (store.state as any) = {
              tokens: {}
            };

            await expect(
              raidenService.getRaidenAccountBalances()
            ).resolves.toMatchObject(tokens);
            expect(raiden.getTokenInfo).toHaveBeenCalledTimes(2);
          });

          test('load from cache if found', async () => {
            (store.state as any) = {
              tokens: {
                '0x1': {
                  ...createToken('0x1')
                }
              }
            };

            await expect(
              raidenService.getRaidenAccountBalances()
            ).resolves.toMatchObject(tokens);
            expect(raiden.getTokenInfo).toHaveBeenCalledTimes(1);
          });
        });
      });
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

      raiden.getTokenList = jest
        .fn()
        .mockResolvedValue([mockToken1, mockToken2]);
      raiden.getTokenInfo = jest.fn().mockImplementation(mockToken);

      providerMock.mockResolvedValue(mockProvider);
      factory.mockResolvedValue(raiden);
    });

    describe('with existing state', () => {
      beforeEach(() => {
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
          tokens: [{ address: mockToken1 } as TokenModel]
        };
      });

      test('updates the tokens when it fetches a non-cached token ', async () => {
        await raidenService.connect();
        await flushPromises();

        expect(store.commit).toBeCalledWith('account', '123');
        expect(store.commit).toBeCalledWith('balance', '0.0');

        await raidenService.fetchTokenData(['0xtoken1']);

        expect(store.commit).toHaveBeenLastCalledWith('updateTokens', {
          [mockToken1]: tokens[mockToken1]
        });
        expect(store.commit).toHaveBeenCalledWith('loadComplete');
      });

      test('checks for the connected token balances when it receives a new block event', async () => {
        expect.assertions(1);

        providerMock.mockResolvedValue(mockProvider);
        const subject = new BehaviorSubject({});
        const testToken = {
          address: mockToken1 as Address,
          decimals: 18,
          name: 'Token 1',
          symbol: 'TKN1'
        };
        raiden.getTokenBalance = jest.fn().mockResolvedValue(One);
        raiden.getTokenList = jest
          .fn()
          .mockResolvedValue([mockToken1 as Address]);
        raiden.getTokenInfo = jest.fn().mockResolvedValue(testToken);
        (raiden as any).events$ = subject;

        await raidenService.connect();
        await flushPromises();
        store.commit.mockReset();
        subject.next({ type: 'block/new' });
        await flushPromises();

        expect(store.commit).toBeCalledWith(
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

    test('loads the token list', async () => {
      raiden.getTokenList = jest
        .fn()
        .mockResolvedValue([mockToken1, mockToken2]);
      raiden.getTokenBalance = jest.fn().mockResolvedValue(bigNumberify(100));
      raiden.getTokenInfo = jest.fn().mockResolvedValue({
        decimals: 0,
        symbol: 'MKT',
        name: 'Mock Token'
      });

      await setupSDK();

      store.commit.mockReset();
      await raidenService.fetchTokenList();
      await flushPromises();
      expect(store.commit).toBeCalledTimes(4);
      expect(store.commit).toHaveBeenCalledWith(
        'updateTokenAddresses',
        expect.arrayContaining([mockToken1, mockToken2])
      );
      expect(store.commit).toHaveBeenCalledWith(
        'updateTokens',
        expect.objectContaining({
          [mockToken1]: { address: mockToken1 },
          [mockToken2]: { address: mockToken2 }
        })
      );
      expect(store.commit).toHaveBeenCalledWith(
        'updateTokens',
        expect.objectContaining({
          [mockToken1]: {
            address: mockToken1,
            balance: bigNumberify(100),
            decimals: 0,
            symbol: 'MKT',
            name: 'Mock Token'
          }
        })
      );
    });
  });

  test('clears the app state when it receives a raidenShutdown event', async () => {
    expect.assertions(1);

    const mockStore = store as any;
    mockStore.getters = {
      tokens: []
    };
    mockStore.state = {
      tokens: {}
    };

    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    raiden.getTokenList = jest.fn().mockResolvedValue([]);
    await setupSDK();
    subject.next({ type: 'raiden/shutdown' });
    await flushPromises();

    expect(store.commit).toHaveBeenLastCalledWith('reset');
  });

  test('update the store with the proper reason when the factory throws an exception', async () => {
    providerMock.mockResolvedValue(mockProvider);
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

  test('commit config$ updates', async () => {
    expect.assertions(1);

    const subject = new BehaviorSubject({});
    (raiden as any).config$ = subject;
    await setupSDK();
    const config = { caps: { [Capabilities.NO_RECEIVE]: true } };
    subject.next(config);

    expect(store.commit).toHaveBeenLastCalledWith('updateConfig', config);
  });

  test('notify that monitor balance proof was send', async () => {
    expect.assertions(1);
    (store.getters as any) = {
      udcToken: {}
    };
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();
    subject.next({
      type: 'ms/balanceProof/sent',
      payload: {
        monitoringService: '0x1234',
        partner: '0x1001',
        reward: parseEther('5'),
        txHash: '0x0001',
        confirmed: true
      },
      meta: {}
    });

    await flushPromises();

    expect(store.dispatch).toHaveBeenCalledWith('notifications/notify', {
      description: 'notifications.ms-balance-proof.description',
      title: 'notifications.ms-balance-proof.title'
    });
  });

  test('notify that withdraw was successful', async () => {
    expect.assertions(1);
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();
    (store.getters as any) = {
      udcToken: {}
    };
    subject.next({
      type: 'udc/withdrawn',
      payload: {
        withdrawal: parseEther('5')
      },
      meta: {
        amount: parseEther('5')
      }
    });

    expect(store.dispatch).toHaveBeenCalledWith('notifications/notify', {
      description: 'notifications.withdrawal.success.description',
      title: 'notifications.withdrawal.success.title'
    });
  });

  test('do not notify that withdraw failed if validation error', async () => {
    expect.assertions(1);
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();
    (store.getters as any) = {
      udcToken: {}
    };
    subject.next({
      type: 'udc/withdraw/failure',
      payload: {
        code: 'UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE'
      },
      meta: {
        amount: parseEther('5')
      }
    });

    expect(store.dispatch).toHaveBeenCalledTimes(0);
  });

  test('notify that withdraw failed', async () => {
    expect.assertions(1);
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();
    (store.getters as any) = {
      udcToken: {}
    };
    subject.next({
      type: 'udc/withdraw/failure',
      payload: {
        code: -3200,
        message: 'gas'
      },
      meta: {
        amount: parseEther('5')
      }
    });

    expect(store.dispatch).toHaveBeenCalledWith('notifications/notify', {
      description: 'notifications.withdrawal.failure.description',
      title: 'notifications.withdrawal.failure.title'
    });
  });

  test('token monitored', async () => {
    expect.assertions(1);
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();

    subject.next({
      type: 'token/monitored',
      payload: {
        token: '0x1234'
      },
      meta: {
        amount: parseEther('5')
      }
    });

    expect(store.commit).toHaveBeenCalledWith('updateTokens', {
      '0x1234': { address: '0x1234' }
    });
  });

  test('update presence', async () => {
    expect.assertions(1);
    const subject = new BehaviorSubject({});
    (raiden as any).events$ = subject;
    await setupSDK();

    subject.next({
      type: 'matrix/presence/success',
      payload: {
        available: true
      },
      meta: {
        address: '0x1234'
      }
    });

    expect(store.commit).toHaveBeenCalledWith('updatePresence', {
      '0x1234': true
    });
  });
});
