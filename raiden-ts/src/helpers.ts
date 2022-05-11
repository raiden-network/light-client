import { Signer } from '@ethersproject/abstract-signer';
import type { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';
import type { Contract, ContractReceipt } from '@ethersproject/contracts';
import type { Network } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { sha256 } from '@ethersproject/sha2';
import { toUtf8Bytes } from '@ethersproject/strings';
import { Wallet } from '@ethersproject/wallet';
import { readFileSync } from 'fs';
import constant from 'lodash/constant';
import memoize from 'lodash/memoize';
import logging from 'loglevel';
import type { MatrixClient } from 'matrix-js-sdk';
import path from 'path';
import type { Observable } from 'rxjs';
import { AsyncSubject, defer, firstValueFrom, ReplaySubject, timer } from 'rxjs';
import {
  exhaustMap,
  filter,
  first,
  map,
  mergeMap,
  pluck,
  retryWhen,
  shareReplay,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from './actions';
import { raidenShutdown, raidenSynced } from './actions';
import type { channelSettle } from './channels/actions';
import type { Channel, RaidenChannel, RaidenChannels } from './channels/state';
import { ChannelState } from './channels/state';
import { channelAmounts, channelKey } from './channels/utils';
import type { PartialRaidenConfig } from './config';
import { makeDefaultConfig } from './config';
import { ShutdownReason } from './constants';
import {
  HumanStandardToken__factory,
  MonitoringService__factory,
  SecretRegistry__factory,
  ServiceRegistry__factory,
  TokenNetwork__factory,
  TokenNetworkRegistry__factory,
  UserDeposit__factory,
} from './contracts';
import type { RaidenDatabase, RaidenDatabaseMeta, TransferStateish } from './db/types';
import {
  changes$,
  getDatabaseConstructorFromOptions,
  getRaidenState,
  migrateDatabase,
  putRaidenState,
  replaceDatabase,
} from './db/utils';
import goerliDeploy from './deployment/deployment_goerli_unstable.json';
import mainnetDeploy from './deployment/deployment_mainnet.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import ropstenDeploy from './deployment/deployment_ropsten.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli_unstable.json';
import mainnetServicesDeploy from './deployment/deployment_services_mainnet.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import { makeInitialState, RaidenState } from './state';
import { standardCalculator } from './transfers/mediate/types';
import type { RaidenTransfer } from './transfers/state';
import { TransferState } from './transfers/state';
import { raidenTransfer } from './transfers/utils';
import type { Latest, RaidenEpicDeps } from './types';
import { ContractsInfo } from './types';
import { assert } from './utils';
import { isActionOf } from './utils/actions';
import { jsonParse } from './utils/data';
import { ErrorCodes, RaidenError } from './utils/error';
import { getLogsByChunk$, getNetworkName } from './utils/ethers';
import { LruCache } from './utils/lru';
import { pluckDistinct } from './utils/rx';
import type { Decodable, Hash, UInt } from './utils/types';
import { Address, decode, isntNil, PrivateKey } from './utils/types';

/**
 * Returns contract information depending on the passed [[Network]]. Currently, `mainnet`,
 * `rinkeby`, `ropsten` and `goerli` are supported.
 * The deployment info of these networks are embedded at build-time. In case it can't parse as one
 * of those, we try to use NodeJS's `fs` (or compatible shims) utilities to read json directly
 * from the `deployment` dist folder, and throw if it fails.
 *
 * @param network - Current network, as detected by ether's Provider (see @ethersproject/networks)
 * @returns deployed contract information of the network
 */
export function getContracts(network: Network): ContractsInfo {
  let info: Decodable<ContractsInfo>;
  switch (network.name) {
    case 'rinkeby':
      info = {
        ...rinkebyDeploy.contracts,
        ...rinkebyServicesDeploy.contracts,
      };
      break;
    case 'ropsten':
      info = {
        ...ropstenDeploy.contracts,
        ...ropstenServicesDeploy.contracts,
      };
      break;
    case 'goerli':
      info = {
        ...goerliDeploy.contracts,
        ...goerliServicesDeploy.contracts,
      };
      break;
    case 'homestead':
      info = {
        ...mainnetDeploy.contracts,
        ...mainnetServicesDeploy.contracts,
      };
      break;
    default:
      try {
        info = {
          ...JSON.parse(
            readFileSync(
              path.join(__dirname, 'deployment', `deployment_${getNetworkName(network)}.json`),
              'utf-8',
            ),
          ),
          ...JSON.parse(
            readFileSync(
              path.join(
                __dirname,
                'deployment',
                `deployment_services_${getNetworkName(network)}.json`,
              ),
              'utf-8',
            ),
          ),
        };
      } catch (e) {
        throw new RaidenError(ErrorCodes.RDN_UNRECOGNIZED_NETWORK, { network });
      }
  }
  return decode(ContractsInfo, info);
}

/**
 * Generate, sign and return a subkey from provided main account
 *
 * @param network - Network to include in message
 * @param main - Main signer to derive subkey from
 * @param originUrl - URL of the origin to generate the subkey for
 * @returns Subkey's signer & address
 */
async function genSubkey(network: Network, main: Signer, originUrl?: string) {
  const url = originUrl ?? globalThis?.location?.origin ?? 'unknown';
  const message = `=== RAIDEN SUBKEY GENERATION ===

Network: ${getNetworkName(network).toUpperCase()}
Raiden dApp URL: ${url}

WARNING: ensure this signature is being requested from Raiden dApp running at URL above by comparing it to your browser's url bar.
Signing this message at any other address WILL give it FULL control of this subkey's funds, tokens and Raiden channels!`;

  const signature = await main.signMessage(toUtf8Bytes(message));
  const pk = sha256(signature) as Hash;
  const signer = new Wallet(pk, main.provider);

  return { signer, address: signer.address as Address };
}

/**
 * Returns a [[Signer]] based on the `account` and `provider`.
 * Throws an exception if the `account` is not a valid address or private key.
 *
 * @param account - an account used for signing
 * @param provider - a provider
 * @param subkey - Whether to generate a subkey
 * @param subkeyOriginUrl - URL of the origin to generate a subkey for
 * @returns a [[Signer]] or [[Wallet]] that can be used for signing
 */
export const getSigner = async (
  account: string | number | Signer,
  provider: JsonRpcProvider,
  subkey?: boolean,
  subkeyOriginUrl?: string,
) => {
  let signer;
  let address: Address;
  let main;

  if (Signer.isSigner(account)) {
    if (account.provider === provider) {
      signer = account;
    } else if (account instanceof Wallet) {
      signer = account.connect(provider);
    } else {
      throw new RaidenError(ErrorCodes.RDN_SIGNER_NOT_CONNECTED, {
        account: account.toString(),
        provider: provider.toString(),
      });
    }
    address = (await signer.getAddress()) as Address;
  } else if (typeof account === 'number') {
    // index of account in provider
    signer = provider.getSigner(account);
    address = (await signer.getAddress()) as Address;
  } else if (Address.is(account)) {
    // address
    const accounts = await provider.listAccounts();
    if (!accounts.includes(account)) {
      throw new RaidenError(ErrorCodes.RDN_ACCOUNT_NOT_FOUND, {
        account,
        accounts: JSON.stringify(accounts),
      });
    }
    signer = provider.getSigner(account);
    address = account;
  } else if (PrivateKey.is(account)) {
    // private key
    signer = new Wallet(account, provider);
    address = signer.address as Address;
  } else {
    throw new RaidenError(ErrorCodes.RDN_STRING_ACCOUNT_INVALID);
  }

  if (subkey) {
    main = { signer, address };
    ({ signer, address } = await genSubkey(
      await provider.getNetwork(),
      main.signer,
      subkeyOriginUrl,
    ));
  }

  return { signer, address, main };
};

/**
 * Provides a live stream of transfer documents containing transfer updates
 * If you want pagination, use [[getTransfers]] instead
 *
 * @param db - Database instance
 * @returns observable of sent and completed Raiden transfers
 */
export function initTransfers$(db: RaidenDatabase): Observable<RaidenTransfer> {
  return changes$<TransferStateish>(db, {
    since: 0,
    live: true,
    include_docs: true,
    selector: { 'transfer.ts': { $gt: 0 } },
  }).pipe(map(({ doc }) => raidenTransfer(decode(TransferState, doc))));
}

/**
 * Transforms the redux channel state to [[RaidenChannels]]
 *
 * @param channels - RaidenState.channels
 * @returns Raiden public channels mapping
 */
export const mapRaidenChannels = (channels: RaidenState['channels']): RaidenChannels =>
  Object.values(channels).reduce((acc, channel) => {
    const amounts = channelAmounts(channel);
    const raidenChannel: RaidenChannel = {
      state: channel.state,
      id: channel.id,
      token: channel.token,
      tokenNetwork: channel.tokenNetwork,
      settleTimeout: channel.settleTimeout,
      openBlock: channel.openBlock,
      closeBlock: 'closeBlock' in channel ? channel.closeBlock : undefined,
      partner: channel.partner.address,
      balance: amounts.ownBalance,
      capacity: amounts.ownCapacity,
      ...amounts,
    };
    return {
      ...acc,
      [channel.token]: {
        ...acc[channel.token],
        [channel.partner.address]: raidenChannel,
      },
    };
  }, {} as { [token: string]: { [partner: string]: RaidenChannel } });

/**
 * Return signer & address to use for on-chain txs depending on subkey param
 *
 * @param deps - RaidenEpicDeps subset
 * @param deps.signer - Signer instance
 * @param deps.address - Own address
 * @param deps.main - Main signer/address, if any
 * @param subkey - Whether to prefer the subkey or the main key
 * @returns Signer & Address to use for on-chain operations
 */
export function chooseOnchainAccount(
  {
    signer,
    address,
    main,
  }: {
    signer: RaidenEpicDeps['signer'];
    address: RaidenEpicDeps['address'];
    main?: RaidenEpicDeps['main'];
  },
  subkey?: boolean,
) {
  if (main && !subkey) return main;
  return { signer, address };
}

/**
 * Returns a contract instance with attached signer
 *
 * @param contract - Contract instance
 * @param signer - Signer to use on contract
 * @returns contract instance with signer
 */
export function getContractWithSigner<C extends Contract>(contract: C, signer: Signer): C {
  if (contract.signer === signer) return contract;
  return contract.connect(signer) as C;
}

/**
 * Waits for receipt to have at least `confBlocks` confirmations; resolves immediately if already;
 * throws if it gets removed by a reorg.
 *
 * @param receipt - Receipt to wait for confirmation
 * @param deps - RaidenEpicDeps
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @param confBlocks - Confirmation blocks, defaults to `config.confirmationBlocks`
 * @returns Promise to final blockNumber of transaction
 */
export async function waitConfirmation(
  receipt: ContractReceipt,
  { latest$, config$, provider }: RaidenEpicDeps,
  confBlocks?: number,
): Promise<number> {
  const txBlock = receipt.blockNumber!;
  const txHash = receipt.transactionHash!;
  return firstValueFrom(
    latest$.pipe(
      pluckDistinct('state', 'blockNumber'),
      withLatestFrom(config$),
      filter(
        ([blockNumber, { confirmationBlocks }]) =>
          txBlock + (confBlocks ?? confirmationBlocks) <= blockNumber,
      ),
      exhaustMap(([blockNumber, { confirmationBlocks }]) =>
        defer(async () => provider.getTransactionReceipt(txHash)).pipe(
          map((receipt) => {
            if (
              receipt?.confirmations &&
              receipt.confirmations >= (confBlocks ?? confirmationBlocks)
            )
              return receipt.blockNumber;
            else if (txBlock + 2 * (confBlocks ?? confirmationBlocks) < blockNumber)
              throw new RaidenError(ErrorCodes.RDN_TRANSACTION_REORG, {
                transactionHash: txHash,
              });
          }),
        ),
      ),
      filter(isntNil),
    ),
  );
}

/**
 * Construct entire ContractsInfo using UserDeposit contract address as entrypoint
 *
 * @param provider - Ethers provider to use to fetch contracts data
 * @param userDeposit - UserDeposit contract address as entrypoint
 * @param fromBlock - If specified, uses this as initial scanning block
 * @returns contracts info, with blockNumber as block of first registered tokenNetwork
 */
export async function fetchContractsInfo(
  provider: JsonRpcProvider,
  userDeposit: Address,
  fromBlock?: number,
): Promise<ContractsInfo> {
  const userDepositContract = UserDeposit__factory.connect(userDeposit, provider);

  const monitoringService = (await userDepositContract.msc_address()) as Address;
  const monitoringServiceContract = MonitoringService__factory.connect(
    monitoringService,
    provider,
  );

  const tokenNetworkRegistry =
    (await monitoringServiceContract.token_network_registry()) as Address;
  const tokenNetworkRegistryContract = TokenNetworkRegistry__factory.connect(
    tokenNetworkRegistry,
    provider,
  );

  const secretRegistry = (await tokenNetworkRegistryContract.secret_registry_address()) as Address;
  const serviceRegistry = (await monitoringServiceContract.service_registry()) as Address;

  const toBlock = await provider.getBlockNumber();
  const firstBlock =
    fromBlock ||
    (await firstValueFrom(
      getLogsByChunk$(provider, {
        ...tokenNetworkRegistryContract.filters.TokenNetworkCreated(null, null),
        fromBlock: 1,
        toBlock,
      }).pipe(pluck('blockNumber'), filter(isntNil)),
      { defaultValue: toBlock },
    ));

  const oneToN = (await userDepositContract.one_to_n_address()) as Address;

  return {
    TokenNetworkRegistry: { address: tokenNetworkRegistry, block_number: firstBlock },
    ServiceRegistry: { address: serviceRegistry, block_number: firstBlock },
    UserDeposit: { address: userDeposit, block_number: firstBlock },
    SecretRegistry: { address: secretRegistry, block_number: firstBlock },
    MonitoringService: { address: monitoringService, block_number: firstBlock },
    OneToN: { address: oneToN, block_number: firstBlock },
  };
}

/**
 * Resolves to our current UDC balance, as seen from [[monitorUdcBalanceEpic]]
 *
 * @param latest$ - Latest observable
 * @returns Promise to our current UDC balance
 */
export async function getUdcBalance(latest$: Observable<Latest>): Promise<UInt<32>> {
  return firstValueFrom(
    latest$.pipe(
      pluck('udcDeposit', 'balance'),
      filter((balance) => !!balance && balance.lt(MaxUint256)),
    ),
  );
}

/**
 * @param action$ - Observable of RaidenActions
 * @returns Promise which resolves when Raiden is synced
 */
export function makeSyncedPromise(
  action$: Observable<RaidenAction>,
): Promise<raidenSynced['payload'] | undefined> {
  return firstValueFrom(
    action$.pipe(
      first(isActionOf([raidenSynced, raidenShutdown])),
      map((action) => {
        if (raidenShutdown.is(action)) {
          // don't reject if not stopped by an error
          if (Object.values(ShutdownReason).some((reason) => reason === action.payload.reason))
            return;
          throw action.payload;
        }
        return action.payload;
      }),
    ),
  );
}

/**
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.getTokenContract - Token contract factory/getter
 * @returns Memoized function to fetch token info
 */
export function makeTokenInfoGetter({
  log,
  getTokenContract,
}: Pick<RaidenEpicDeps, 'log' | 'getTokenContract'>): (token: string) => Promise<{
  totalSupply: BigNumber;
  decimals: number;
  name?: string;
  symbol?: string;
}> {
  return memoize(async function getTokenInfo(token: string) {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], log.info);
    const tokenContract = getTokenContract(token);
    const [totalSupply, decimals, name, symbol] = await Promise.all([
      tokenContract.callStatic.totalSupply(),
      tokenContract.callStatic.decimals(),
      tokenContract.callStatic.name().catch(constant(undefined)),
      tokenContract.callStatic.symbol().catch(constant(undefined)),
    ]);
    return { totalSupply, decimals, name, symbol };
  });
}

function validateDump(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dump: { _id: string; value: any }[],
  {
    address,
    network,
    contractsInfo,
  }: Pick<RaidenEpicDeps, 'address' | 'network' | 'contractsInfo'>,
) {
  const meta = dump[0] as unknown as RaidenDatabaseMeta;
  assert(meta?._id === '_meta', ErrorCodes.RDN_STATE_MIGRATION);
  assert(meta.address === address, ErrorCodes.RDN_STATE_ADDRESS_MISMATCH);
  assert(
    meta.registry === contractsInfo.TokenNetworkRegistry.address,
    ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
  );
  assert(meta.network === network.chainId, ErrorCodes.RDN_STATE_NETWORK_MISMATCH);

  assert(
    dump.find((l) => l._id === 'state.address')?.value === address,
    ErrorCodes.RDN_STATE_ADDRESS_MISMATCH,
  );
  assert(
    dump.find((l) => l._id === 'state.chainId')?.value === network.chainId,
    ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
  );
  assert(
    dump.find((l) => l._id === 'state.registry')?.value ===
      contractsInfo.TokenNetworkRegistry.address,
    ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
  );
}

/**
 * Loads state from `storageOrState`. Returns the initial [[RaidenState]] if
 * `storageOrState` does not exist.
 *
 * @param deps - Partial epics dependencies-like object
 * @param deps.address - current address of the signer
 * @param deps.network - current network
 * @param deps.contractsInfo - current contracts
 * @param deps.log - Logger instance
 * @param storage - diverse storage related parameters to load from and save to
 * @param storage.state - Uploaded state: replaces database state; must be newer than database
 * @param storage.adapter - PouchDB adapter; default to 'indexeddb' on browsers and 'leveldb' on
 *    node. If you provide a custom one, ensure you call PouchDB.plugin on it.
 * @param storage.prefix - Database name prefix; use to set a directory to store leveldown db;
 * @returns database and RaidenDoc object
 */
export async function getState(
  {
    address,
    network,
    contractsInfo,
    log,
  }: Pick<RaidenEpicDeps, 'address' | 'network' | 'contractsInfo' | 'log'>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: { state?: any; adapter?: any; prefix?: string } = {},
): Promise<{ db: RaidenDatabase; state: RaidenState }> {
  const dbName = [
    'raiden',
    getNetworkName(network),
    contractsInfo.TokenNetworkRegistry.address,
    address,
  ].join('_');

  let db;
  const { state: stateDump, ...opts } = storage;
  let dump = stateDump;

  // PouchDB configs are passed as custom database constructor using PouchDB.defaults
  const dbCtor = await getDatabaseConstructorFromOptions({ ...opts, log });

  if (dump) {
    if (typeof dump === 'string') dump = jsonParse(dump);

    // perform some early simple validation on dump before persisting it in database
    validateDump(dump, { address, network, contractsInfo });

    db = await replaceDatabase.call(dbCtor, dump, dbName);
    // only if succeeds:
  } else {
    db = await migrateDatabase.call(dbCtor, dbName);
  }

  let state = await getRaidenState(db);
  if (!state) {
    state = makeInitialState({ network, address, contractsInfo: contractsInfo });
    await putRaidenState(db, state);
  } else {
    state = decode(RaidenState, state);
  }

  return { db, state };
}

const settleableStates = [ChannelState.settleable, ChannelState.settling] as const;
const preSettleableStates = [ChannelState.closed, ...settleableStates] as const;

/**
 * Waits for channel to become settleable
 *
 * Errors if channel doesn't exist or isn't closed, settleable or settling (states which precede
 * or are considered settleable)
 *
 * @param state$ - Observable of RaidenStates
 * @param meta - meta of channel for which to wait
 * @returns Observable which waits until channel becomes settleable
 */
export function waitChannelSettleable$(
  state$: Observable<RaidenState>,
  meta: channelSettle.request['meta'],
) {
  return state$.pipe(
    first(),
    mergeMap(({ channels }) => {
      const channel = channels[channelKey(meta)];
      assert(
        channel && (preSettleableStates as readonly ChannelState[]).includes(channel.state),
        ErrorCodes.CNL_NO_SETTLEABLE_OR_SETTLING_CHANNEL_FOUND,
      );
      return state$.pipe(pluckDistinct('channels', channelKey(meta)));
    }),
    first((channel): channel is Channel & { state: typeof settleableStates[number] } =>
      (settleableStates as readonly ChannelState[]).includes(channel.state),
    ),
  );
}

/**
 * Make a getBlockTimestamp function which caches the returned observable for a given blockNumber,
 * retries in case of errors and clears the cache in case of permanent failure;
 *
 * @param provider - provider instance to get block info from
 * @param maxErrors - maximum errors to retry
 * @returns cached observable which emits block timestamp (in seconds) once and completes
 */
function makeBlockTimestampGetter(
  provider: JsonRpcProvider,
  maxErrors = 3,
): RaidenEpicDeps['getBlockTimestamp'] {
  const cache = new LruCache<number, Observable<number>>(128);
  return function getBlockTimestamp(block: number): Observable<number> {
    let cached = cache.get(block);
    if (!cached) {
      cached = defer(async () => provider.getBlock(block)).pipe(
        map(({ timestamp }) => {
          assert(timestamp, ['no timestamp in block', { block }]);
          return timestamp;
        }),
        retryWhen((err$) =>
          err$.pipe(
            mergeMap((err, i) => {
              if (i >= maxErrors) throw err;
              return timer(provider.pollingInterval);
            }),
          ),
        ),
        tap({ error: () => cache.delete(block) }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      cache.set(block, cached);
    }
    return cached;
  };
}

/**
 * Helper function to create the RaidenEpicDeps dependencies object for Raiden Epics
 *
 * @param state - Initial/previous RaidenState
 * @param config - defaultConfig overwrites
 * @param opts - Options
 * @param opts.signer - Signer holding raiden account connected to a JsonRpcProvider
 * @param opts.contractsInfo - Object holding deployment information from Raiden contracts on
 *      current network
 * @param opts.db - Database instance
 * @param opts.main - Main account object, set when using a subkey as raiden signer
 * @returns Constructed epics dependencies object
 */
export function makeDependencies(
  state: RaidenState,
  config: PartialRaidenConfig | undefined,
  {
    signer,
    contractsInfo,
    db,
    main,
  }: Pick<RaidenEpicDeps, 'signer' | 'contractsInfo' | 'db' | 'main'>,
): RaidenEpicDeps {
  assert(
    signer.provider && signer.provider instanceof JsonRpcProvider && signer.provider.network,
    'Signer must be connected to a JsonRpcProvider',
  );
  const latest$ = new ReplaySubject<Latest>(1);
  const config$ = latest$.pipe(pluckDistinct('config'));
  const registryContract = TokenNetworkRegistry__factory.connect(
    contractsInfo.TokenNetworkRegistry.address,
    main?.signer ?? signer,
  );

  return {
    latest$,
    config$,
    matrix$: new AsyncSubject<MatrixClient>(),
    signer,
    provider: signer.provider,
    network: signer.provider.network,
    address: state.address,
    log: logging.getLogger(`raiden:${state.address}`),
    defaultConfig: makeDefaultConfig({ network: signer.provider.network }, config),
    contractsInfo,
    registryContract,
    getTokenNetworkContract: memoize((address: Address) =>
      TokenNetwork__factory.connect(address, main?.signer ?? signer),
    ),
    getTokenContract: memoize((address: Address) =>
      HumanStandardToken__factory.connect(address, main?.signer ?? signer),
    ),
    serviceRegistryContract: ServiceRegistry__factory.connect(
      contractsInfo.ServiceRegistry.address,
      main?.signer ?? signer,
    ),
    userDepositContract: UserDeposit__factory.connect(
      contractsInfo.UserDeposit.address,
      main?.signer ?? signer,
    ),
    secretRegistryContract: SecretRegistry__factory.connect(
      contractsInfo.SecretRegistry.address,
      main?.signer ?? signer,
    ),
    monitoringServiceContract: MonitoringService__factory.connect(
      contractsInfo.MonitoringService.address,
      main?.signer ?? signer,
    ),
    main,
    db,
    init$: new ReplaySubject(),
    mediationFeeCalculator: standardCalculator,
    getBlockTimestamp: makeBlockTimestampGetter(signer.provider),
  };
}
