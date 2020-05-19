import { Signer } from 'ethers/abstract-signer';
import { Wallet } from 'ethers/wallet';
import { Contract, ContractReceipt, ContractTransaction } from 'ethers/contract';
import { Network, toUtf8Bytes, sha256 } from 'ethers/utils';
import { JsonRpcProvider } from 'ethers/providers';
import { Observable, defer } from 'rxjs';
import { filter, map, pluck, withLatestFrom, first, exhaustMap, mergeMap } from 'rxjs/operators';
import logging from 'loglevel';

import { RaidenState } from './state';
import { ContractsInfo, RaidenEpicDeps } from './types';
import { raidenTransfer } from './transfers/utils';
import { RaidenTransfer } from './transfers/state';
import { channelAmounts } from './channels/utils';
import { RaidenChannels, RaidenChannel } from './channels/state';
import { pluckDistinct, distinctRecordValues } from './utils/rx';
import { Address, PrivateKey, isntNil, Hash, assert } from './utils/types';
import { getNetworkName } from './utils/ethers';
import { RaidenError, ErrorCodes } from './utils/error';

import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import goerliDeploy from './deployment/deployment_goerli.json';
import mainnetDeploy from './deployment/deployment_mainnet.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli.json';
import mainnetServicesDeploy from './deployment/deployment_services_mainnet.json';

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
 * @returns Subkey's signer & address
 */
async function genSubkey(network: Network, main: Signer) {
  const url = globalThis?.location?.origin ?? 'unknown';
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
 * @returns a [[Signer]] or [[Wallet]] that can be used for signing
 */
export const getSigner = async (
  account: string | number | Signer,
  provider: JsonRpcProvider,
  subkey?: boolean,
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
    ({ signer, address } = await genSubkey(await provider.getNetwork(), main.signer));
  }

  return { signer, address, main };
};

/**
 * Initializes the [[transfers$]] observable
 *
 * @param state$ - Observable of the current RaidenState
 * @returns observable of sent and completed Raiden transfers
 */
export const initTransfers$ = (state$: Observable<RaidenState>): Observable<RaidenTransfer> =>
  state$.pipe(
    mergeMap(function* ({ sent, received }) {
      yield sent;
      yield received;
    }),
    distinctRecordValues(),
    pluck(1), // pluck values
    // from here, we get TransferState objects which changed from previous state (all on first)
    map(raidenTransfer),
  );

/**
 * Transforms the redux channel state to [[RaidenChannels]]
 *
 * @param channels - RaidenState.channels
 * @returns Raiden public channels mapping
 */
export const mapRaidenChannels = (channels: RaidenState['channels']): RaidenChannels =>
  Object.values(channels).reduce((acc, channel) => {
    const {
      ownDeposit,
      partnerDeposit,
      ownBalance: balance,
      ownCapacity: capacity,
    } = channelAmounts(channel);
    const raidenChannel: RaidenChannel = {
      state: channel.state,
      id: channel.id,
      token: channel.token,
      tokenNetwork: channel.tokenNetwork,
      settleTimeout: channel.settleTimeout,
      openBlock: channel.openBlock,
      closeBlock: 'closeBlock' in channel ? channel.closeBlock : undefined,
      partner: channel.partner.address,
      ownDeposit,
      partnerDeposit,
      balance,
      capacity,
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
 * @param errorCode - ErrorCode to throw in case of failure
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
  errorCode: ErrorCodes,
  { log }: { log: logging.Logger } = { log: logging },
): Promise<ContractReceipt> {
  let tx: ContractTransaction;
  try {
    // 'as C' just to avoid error with unknown functions Bucket
    tx = await (contract.functions as C)[method](...params);
  } catch (err) {
    log.error(`Error sending ${method} tx`, err);
    throw new RaidenError(errorCode, { error: err.message });
  }
  log.debug(`sent ${method} tx "${tx.hash}" to "${contract.address}"`);

  let receipt: ContractReceipt;
  try {
    receipt = await tx.wait();
    assert(receipt.status, `tx status: ${receipt.status}`);
  } catch (err) {
    log.error(`Error mining ${method} tx`, err);
    throw new RaidenError(errorCode, {
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

/*
 * Returns true if `url` is a valid URL or domain.
 * On production `https://` is required for URLs, otherwise `http://` matches as well.
 *
 * @param url - A URL or hostname
 * @returns true if valid URL or domain
 */
export const isValidUrl = (url: string): boolean => {
  const regex =
    process.env.NODE_ENV === 'production'
      ? /^(?:https:\/\/)?[^\s\/$.?#&"']+\.[^\s\/$?#&"']+$/
      : /^(?:(http|https):\/\/)?([^\s\/$.?#&"']+\.)*[^\s\/$?#&"']+(?:(\d+))*$/;
  return regex.test(url);
};
