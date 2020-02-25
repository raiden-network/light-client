import { Signer, Wallet, Contract } from 'ethers';
import { Network, toUtf8Bytes, sha256 } from 'ethers/utils';
import { JsonRpcProvider } from 'ethers/providers';
import { Observable, from } from 'rxjs';
import { filter, map, scan, concatMap, pluck } from 'rxjs/operators';
import { findKey, transform, pick } from 'lodash';

import { RaidenState } from './state';
import { ContractsInfo, RaidenEpicDeps } from './types';
import { raidenSentTransfer } from './transfers/utils';
import { SentTransfer, SentTransfers, RaidenSentTransfer } from './transfers/state';
import { channelAmounts } from './channels/utils';
import { RaidenChannels, RaidenChannel, Channel } from './channels/state';
import { pluckDistinct } from './utils/rx';
import { Address, PrivateKey, isntNil, Hash } from './utils/types';
import { getNetworkName } from './utils/ethers';

import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import goerliDeploy from './deployment/deployment_goerli.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli.json';
import { RaidenError, ErrorCodes } from './utils/error';

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
export const initTransfers$ = (state$: Observable<RaidenState>): Observable<RaidenSentTransfer> =>
  state$.pipe(
    pluckDistinct('sent'),
    concatMap(sent => from(Object.entries(sent))),
    /* this scan stores a reference to each [key,value] in 'acc', and emit as 'changed' iff it
     * changes from last time seen. It relies on value references changing only if needed */
    scan<[string, SentTransfer], { acc: SentTransfers; changed?: SentTransfer }>(
      ({ acc }, [secrethash, sent]) =>
        // if ref didn't change, emit previous accumulator, without 'changed' value
        acc[secrethash] === sent
          ? { acc }
          : // else, update ref in 'acc' and emit value in 'changed' prop
            { acc: { ...acc, [secrethash]: sent }, changed: sent },
      { acc: {} },
    ),
    pluck('changed'),
    filter(isntNil), // filter out if reference didn't change from last emit
    // from here, we get SentTransfer objects which changed from previous state (all on first)
    map(raidenSentTransfer),
  );

/**
 * Returns an object that maps partner addresses to their [[RaidenChannel]].
 *
 * @param partnerChannelMap - an object that maps partnerAddress to a channel
 * @param token - a token address
 * @param tokenNetwork - a token network
 * @returns raiden channel
 */
const mapPartnerToChannel = (
  partnerChannelMap: {
    [partner: string]: Channel;
  },
  token: Address,
  tokenNetwork: string,
): { [partner: string]: RaidenChannel } =>
  transform(
    // transform Channel to RaidenChannel, with more info
    partnerChannelMap,
    (partner2raidenChannel, channel, partner) => {
      const {
        ownDeposit,
        partnerDeposit,
        ownBalance: balance,
        ownCapacity: capacity,
      } = channelAmounts(channel);

      partner2raidenChannel[partner] = {
        state: channel.state,
        ...pick(channel, ['id', 'settleTimeout', 'openBlock', 'closeBlock']),
        token,
        tokenNetwork: tokenNetwork as Address,
        partner: partner as Address,
        ownDeposit,
        partnerDeposit,
        balance,
        capacity,
      };
    },
  );

/**
 * Transforms the redux channel state to [[RaidenChannels]]
 *
 * @param state - current state
 * @returns raiden channels
 */
export const mapTokenToPartner = (state: RaidenState): RaidenChannels =>
  transform(
    // transform state.channels to token-partner-raidenChannel map
    state.channels,
    (result: RaidenChannels, partnerChannelMap, tokenNetwork) => {
      const token = findKey(state.tokens, tn => tn === tokenNetwork) as Address | undefined;
      if (!token) return; // shouldn't happen, token mapping is always bi-directional
      result[token] = mapPartnerToChannel(partnerChannelMap, token, tokenNetwork);
    },
  );

/**
 * Return signer & address to use for on-chain txs depending on subkey param
 *
 * @param deps - RaidenEpicDeps subset
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
