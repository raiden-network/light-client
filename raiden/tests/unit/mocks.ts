import { Subject } from 'rxjs';

import { Network } from 'ethers/utils';
import { JsonRpcProvider, JsonRpcSigner } from 'ethers/providers';

import { TokenNetworkRegistry } from '../../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../../contracts/TokenNetwork';
import { Token } from '../../contracts/Token';

import { RaidenEpicDeps } from 'raiden/types';
import { RaidenState } from 'raiden/store/state';
import { RaidenActions } from 'raiden/store/actions';

export function raidenEpicDeps(): {
  depsMock: RaidenEpicDeps;
  registryFunctions: { token_to_token_networks: jest.Mock<Promise<string>, [string]> };
} {
  const network: Network = { name: 'testnet', chainId: 1337 };

  const MockJsonRpcProvider = jest.fn().mockImplementation(() => ({
    network,
    getNetwork: jest.fn(() => network),
  }));
  const provider: jest.Mocked<JsonRpcProvider> = new MockJsonRpcProvider();

  const MockJsonRpcSigner = jest.fn().mockImplementation(() => ({
    provider,
  }));
  const signer: jest.Mocked<JsonRpcSigner> = new MockJsonRpcSigner();

  const MockContract = jest.fn();

  const registryFunctions = {
    // eslint-disable-next-line
    token_to_token_networks: jest.fn(async (token: string) => token + 'Network'),
  };
  MockContract.mockImplementationOnce(() => ({
    address: '0xregistry',
    provider,
    functions: registryFunctions,
    filters: {},
  }));
  const registryContract: jest.Mocked<TokenNetworkRegistry> = new MockContract();

  const tokenNetworkContracts: { [address: string]: jest.Mocked<TokenNetwork> } = {};
  const getTokenNetworkContract = (address: string): TokenNetwork => {
    if (!(address in tokenNetworkContracts)) {
      MockContract.mockImplementationOnce(() => ({
        address,
        provider,
        functions: {},
        filters: {},
      }));
      tokenNetworkContracts[address] = new MockContract();
    }
    return tokenNetworkContracts[address];
  };

  const tokenContracts: { [address: string]: jest.Mocked<Token> } = {};
  const getTokenContract = (address: string): Token => {
    if (!(address in tokenContracts)) {
      MockContract.mockImplementationOnce(() => ({
        address,
        provider,
        functions: {},
        filters: {},
      }));
      tokenContracts[address] = new MockContract();
    }
    return tokenContracts[address];
  };

  const depsMock: RaidenEpicDeps = {
    stateOutput$: new Subject<RaidenState>(),
    actionOutput$: new Subject<RaidenActions>(),
    address: '0xmyaddress',
    network,
    contractsInfo: {
      TokenNetworkRegistry: {
        address: registryContract.address,
        block_number: 120, // eslint-disable-line
      },
    },
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
  };

  return {
    registryFunctions,
    depsMock,
  };
}
