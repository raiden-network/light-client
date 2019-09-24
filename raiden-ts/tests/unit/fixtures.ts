/* eslint-disable @typescript-eslint/no-explicit-any */

import { patchEthersDefineReadOnly } from './patches';
patchEthersDefineReadOnly();

import { Wallet } from 'ethers';
import { AddressZero } from 'ethers/constants';
import { MatrixClient } from 'matrix-js-sdk';

import { Address, Hash } from 'raiden-ts/utils/types';
import { initialState, RaidenState } from 'raiden-ts/state';
import { HumanStandardToken } from 'raiden-ts/contracts/HumanStandardToken';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';

import { makeMatrix, MockRaidenEpicDeps, MockedContract } from './mocks';

export const epicFixtures = function(
  depsMock: MockRaidenEpicDeps,
): {
  token: Address;
  tokenNetwork: Address;
  partner: Address;
  matrix: jest.Mocked<MatrixClient>;
  channelId: number;
  settleTimeout: number;
  isFirstParticipant: boolean;
  tokenContract: MockedContract<HumanStandardToken>;
  tokenNetworkContract: MockedContract<TokenNetwork>;
  accessToken: string;
  deviceId: string;
  displayName: string;
  partnerUserId: string;
  state: RaidenState;
  partnerSigner: Wallet;
  txHash: Hash;
  matrixServer: string;
  userId: string;
} {
  const wallet = new Wallet('0x3333333333333333333333333333333333333333333333333333333333333333'),
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = wallet.address as Address,
    tokenNetworkContract = depsMock.getTokenNetworkContract(tokenNetwork),
    tokenContract = depsMock.getTokenContract(token),
    settleTimeout = 500,
    channelId = 17,
    isFirstParticipant = true,
    matrixServer = 'matrix.raiden.test',
    userId = `@${depsMock.address.toLowerCase()}:${matrixServer}`,
    accessToken = 'access_token',
    deviceId = 'device_id',
    displayName = 'display_name',
    partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`,
    matrix = makeMatrix(userId, matrixServer),
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash;

  depsMock.registryContract.functions.token_to_token_networks.mockImplementation(async _token =>
    _token === token ? tokenNetwork : AddressZero,
  );

  return {
    token,
    tokenNetwork,
    partner,
    matrix,
    channelId,
    settleTimeout,
    isFirstParticipant,
    tokenContract,
    tokenNetworkContract,
    accessToken,
    deviceId,
    displayName,
    partnerUserId,
    matrixServer,
    userId,
    txHash,
    state: {
      ...initialState,
      address: depsMock.address,
      blockNumber: 125,
    },
    partnerSigner: wallet,
  };
};
