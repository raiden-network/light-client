import { Network } from 'ethers/utils';
import { Signer, Wallet } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers';
import { Observable, from } from 'rxjs';
import { filter, map, scan, concatMap, pluck } from 'rxjs/operators';
import { findKey, transform, pick } from 'lodash';

import { raidenSentTransfer } from './transfers/utils';
import { RaidenState } from './state';
import { SentTransfer, SentTransfers, RaidenSentTransfer } from './transfers/state';
import { RaidenChannels, RaidenChannel, Channel } from './channels/state';
import { Address, PrivateKey, isntNil } from './utils/types';
import { ContractsInfo } from './types';
import { channelAmounts } from './channels/utils';
import { pluckDistinct } from './utils/rx';

import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import goerliDeploy from './deployment/deployment_goerli.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli.json';

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
      throw new Error(
        `No deploy info provided nor recognized network: ${JSON.stringify(network)}`,
      );
  }
};

/**
 * Returns a [[Signer]] based on the `account` and `provider`.
 * Throws an exception if the `account` is not a valid address or private key.
 *
 * @param account - an account used for signing
 * @param provider - a provider
 * @returns a [[Signer]] or [[Wallet]] that can be used for signing
 */
export const getSigner = async (account: string | number | Signer, provider: JsonRpcProvider) => {
  if (Signer.isSigner(account)) {
    if (account.provider === provider) {
      return account;
    } else if (account instanceof Wallet) {
      return account.connect(provider);
    } else {
      throw new Error(`Signer ${account} not connected to ${provider}`);
    }
  } else if (typeof account === 'number') {
    // index of account in provider
    return provider.getSigner(account);
  } else if (Address.is(account)) {
    // address
    const accounts = await provider.listAccounts();
    if (!accounts.includes(account)) {
      throw new Error(`Account "${account}" not found in provider, got=${accounts}`);
    }
    return provider.getSigner(account);
  } else if (PrivateKey.is(account)) {
    // private key
    return new Wallet(account, provider);
  } else {
    throw new Error('String account must be either a 0x-encoded address or private key');
  }
};

/**
 * Initializes the [[transfers$]] observable
 *
 * @param state$ - Observable of the current RaidenState
 * @returns observable of sent and completed Raiden transfers
 */
export const initTransfersObservable = (
  state$: Observable<RaidenState>,
): Observable<RaidenSentTransfer> =>
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
