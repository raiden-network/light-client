import { Signer } from '@ethersproject/abstract-signer';
import { MaxUint256 } from '@ethersproject/constants';
import type { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import type { Network } from '@ethersproject/networks';
import type { JsonRpcProvider } from '@ethersproject/providers';
import { sha256 } from '@ethersproject/sha2';
import { toUtf8Bytes } from '@ethersproject/strings';
import { Wallet } from '@ethersproject/wallet';
import isEqual from 'lodash/isEqual';
import logging from 'loglevel';
import type { Observable } from 'rxjs';
import { defer, merge } from 'rxjs';
import {
  exhaustMap,
  filter,
  first,
  map,
  pluck,
  take,
  takeWhile,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from './actions';
import { channelDeposit } from './channels/actions';
import type { RaidenChannel, RaidenChannels } from './channels/state';
import { channelAmounts, channelKey } from './channels/utils';
import type { RaidenConfig } from './config';
import {
  MonitoringService__factory,
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
import goerliDeploy from './deployment/deployment_goerli.json';
import mainnetDeploy from './deployment/deployment_mainnet.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import ropstenDeploy from './deployment/deployment_ropsten.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli.json';
import mainnetServicesDeploy from './deployment/deployment_services_mainnet.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import { messageServiceSend } from './messages/actions';
import { PfsMode, Service } from './services/types';
import { makeInitialState, RaidenState } from './state';
import type { RaidenTransfer } from './transfers/state';
import { Direction, TransferState } from './transfers/state';
import { raidenTransfer } from './transfers/utils';
import type { ContractsInfo, Latest, RaidenEpicDeps } from './types';
import { assert } from './utils';
import { asyncActionToPromise } from './utils/actions';
import { jsonParse } from './utils/data';
import { ErrorCodes, RaidenError } from './utils/error';
import { getLogsByChunk$, getNetworkName } from './utils/ethers';
import { distinctRecordValues, pluckDistinct } from './utils/rx';
import type { Hash, UInt } from './utils/types';
import { Address, decode, isntNil, PrivateKey } from './utils/types';

/**
 * Returns contract information depending on the passed [[Network]]. Currently, only
 * `rinkeby`, `ropsten` and `goerli` are supported.
 * Throws an exception if called with another [[Network]].
 *
 * @param network - an account used for signing
 * @returns deployed contract information of the network
 */
export const getContracts = (network: Network): ContractsInfo => {
  switch (network.name) {
    case 'rinkeby':
      return ({
        ...rinkebyDeploy.contracts,
        ...rinkebyServicesDeploy.contracts,
      } as unknown) as ContractsInfo;
    case 'ropsten':
      return ({
        ...ropstenDeploy.contracts,
        ...ropstenServicesDeploy.contracts,
      } as unknown) as ContractsInfo;
    case 'goerli':
      return ({
        ...goerliDeploy.contracts,
        ...goerliServicesDeploy.contracts,
      } as unknown) as ContractsInfo;
    case 'homestead':
      return ({
        ...mainnetDeploy.contracts,
        ...mainnetServicesDeploy.contracts,
      } as unknown) as ContractsInfo;
    default:
      throw new RaidenError(ErrorCodes.RDN_UNRECOGNIZED_NETWORK, { network: network.name });
  }
};

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
 * Initializes the [[transfers$]] observable
 * TODO: properly paginate this, in case of too much transfers in history to stream
 *
 * @param state$ - Observable of RaidenStates
 * @param db - Database instance
 * @returns observable of sent and completed Raiden transfers
 */
export function initTransfers$(
  state$: Observable<RaidenState>,
  db: RaidenDatabase,
): Observable<RaidenTransfer> {
  return merge(
    changes$<TransferStateish>(db, {
      since: 0,
      include_docs: true,
      selector: { direction: { $in: Object.values(Direction) } },
    }).pipe(
      pluck('doc'),
      filter(isntNil),
      map((doc) => decode(TransferState, doc)),
    ),
    state$.pipe(pluckDistinct('transfers'), distinctRecordValues(), pluck(1)),
  ).pipe(map(raidenTransfer));
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
 * Calls a contract method and wait for it to be mined successfuly, rejects otherwise
 *
 * @param contract - Contract instance
 * @param method - Method name
 * @param params - Params tuple to method
 * @param error - Error message to throw in case of failure
 * @param opts - Options
 * @param opts.log - Logger instance
 * @returns Promise to successful receipt
 */
export async function callAndWaitMined<
  C extends Contract,
  M extends keyof C['functions'],
  P extends Parameters<C['functions'][M]>
>(
  contract: C,
  method: M,
  params: P,
  error: string,
  { log }: { log: logging.Logger } = { log: logging },
): Promise<ContractReceipt> {
  let tx: ContractTransaction;
  try {
    // 'as C' just to avoid error with unknown functions Bucket
    tx = await (contract.functions as C)[method](...params);
  } catch (err) {
    log.error(`Error sending ${method} tx`, err);
    throw new RaidenError(error, { error: err.message });
  }
  log.debug(`sent ${method} tx "${tx.hash}" to "${contract.address}"`);

  let receipt: ContractReceipt;
  try {
    receipt = await tx.wait();
    assert(receipt.status, `tx status: ${receipt.status}`);
  } catch (err) {
    log.error(`Error mining ${method} tx`, err);
    throw new RaidenError(error, {
      transactionHash: tx.hash!,
    });
  }
  log.debug(`${method} tx "${tx.hash}" successfuly mined!`);
  return receipt;
}

/**
 * Waits for a given receipt to be confirmed; throws if it gets removed by a reorg instead
 *
 * @param receipt - Receipt to wait for confirmation
 * @param deps - RaidenEpicDeps
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @param confBlocks - Overwrites config
 * @returns Promise final block of transaction
 */
export async function waitConfirmation(
  receipt: ContractReceipt,
  { latest$, config$, provider }: RaidenEpicDeps,
  confBlocks?: number,
): Promise<number> {
  const txBlock = receipt.blockNumber!;
  const txHash = receipt.transactionHash!;
  return latest$
    .pipe(
      pluckDistinct('state', 'blockNumber'),
      withLatestFrom(config$),
      filter(
        ([blockNumber, { confirmationBlocks }]) =>
          txBlock + (confBlocks ?? confirmationBlocks) <= blockNumber,
      ),
      exhaustMap(([blockNumber, { confirmationBlocks }]) =>
        defer(() => provider.getTransactionReceipt(txHash)).pipe(
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
      first(isntNil),
    )
    .toPromise();
}

/**
 * Construct entire ContractsInfo using UserDeposit contract address as entrypoint
 *
 * @param provider - Ethers provider to use to fetch contracts data
 * @param userDeposit - UserDeposit contract address as entrypoint
 * @returns contracts info, with blockNumber as block of first registered tokenNetwork
 */
export async function fetchContractsInfo(
  provider: JsonRpcProvider,
  userDeposit: Address,
): Promise<ContractsInfo> {
  const userDepositContract = UserDeposit__factory.connect(userDeposit, provider);

  const monitoringService = (await userDepositContract.msc_address()) as Address;
  const monitoringServiceContract = MonitoringService__factory.connect(
    monitoringService,
    provider,
  );

  const tokenNetworkRegistry = (await monitoringServiceContract.token_network_registry()) as Address;
  const tokenNetworkRegistryContract = TokenNetworkRegistry__factory.connect(
    tokenNetworkRegistry,
    provider,
  );

  const secretRegistry = (await tokenNetworkRegistryContract.secret_registry_address()) as Address;
  const serviceRegistry = (await monitoringServiceContract.service_registry()) as Address;

  const toBlock = await provider.getBlockNumber();
  let firstBlock = await getLogsByChunk$(provider, {
    ...tokenNetworkRegistryContract.filters.TokenNetworkCreated(null, null),
    fromBlock: 1,
    toBlock,
  })
    .pipe(pluck('blockNumber'), filter(isntNil), take(1))
    .toPromise();
  firstBlock ??= 0;

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
  return latest$
    .pipe(
      pluck('udcBalance'),
      first((balance) => !!balance && balance.lt(MaxUint256)),
    )
    .toPromise();
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
  const meta = (dump[0] as unknown) as RaidenDatabaseMeta;
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
  let { state: dump } = storage;
  const { adapter, prefix } = storage;

  // PouchDB configs are passed as custom database constructor using PouchDB.defaults
  const dbCtor = await getDatabaseConstructorFromOptions({ log, adapter, prefix });

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

/**
 * For a given channelId (passed as opts.meta), waits for a deposit to be confirmed and for the
 * following messageServiceSend for its PFSCapacityUpdate to succeed
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param opts - Options
 * @param opts.meta - channelId on which to wait for a deposit
 * @param opts.config - RaidenConfig to check if PFS is enabled
 * @returns Promise for undefined or messageServiceSend.success action
 */
export async function waitForPFSCapacityUpdate(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { meta, config }: { meta: channelDeposit.request['meta']; config: RaidenConfig },
) {
  if (config.pfsMode === PfsMode.disabled) return;
  const postMeta: messageServiceSend.request['meta'] = { service: Service.PFS, msgId: '' };
  let deposited = false;
  return asyncActionToPromise(
    messageServiceSend,
    postMeta, // pass postMeta by reference, so it gets used for filtering once msgId is set
    // like action$, but sets proper postMeta for filtering *once* deposited and request is
    // identified in a synchronous way
    action$.pipe(
      withLatestFrom(state$),
      tap(([action, state]) => {
        if (channelDeposit.success.is(action) && action.payload.confirmed) {
          deposited = true;
          return;
        }
        // ignore if not deposited yet or request's msgId already identified
        if (!deposited || postMeta.msgId || !messageServiceSend.request.is(action)) return;
        const message = action.payload.message;
        if (message.type !== 'PFSCapacityUpdate') return;
        // ensure it's a PFSCapacityUpdate for this specific channel
        if (
          message.canonical_identifier.token_network_address !== meta.tokenNetwork ||
          !message.canonical_identifier.channel_identifier.eq(state.channels[channelKey(meta)]?.id)
        )
          return;
        // on the first messageServiceSend.request for a PFSCapacityUpdate for this channel
        // *after* deposit is confirmed, "save" msgId to be used in filter for success
        postMeta.msgId = action.meta.msgId;
      }),
      pluck(0),
      takeWhile((action) => !(channelDeposit.failure.is(action) && isEqual(action.meta, meta))),
    ),
  );
}
