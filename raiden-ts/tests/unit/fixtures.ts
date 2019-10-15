/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { patchEthersDefineReadOnly } from './patches';
patchEthersDefineReadOnly();

import { Wallet } from 'ethers';
import { AddressZero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';

import { Address, Hash, UInt, Int } from 'raiden-ts/utils/types';
import { initialState, RaidenState } from 'raiden-ts/state';
import { HumanStandardToken } from 'raiden-ts/contracts/HumanStandardToken';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';
import { Metadata, Processed, MessageType } from 'raiden-ts/messages/types';
import { makeMessageId, makePaymentId } from 'raiden-ts/transfers/utils';
import { Paths } from 'raiden-ts/path/types';

import { makeMatrix, MockRaidenEpicDeps, MockedContract } from './mocks';

export const epicFixtures = function(
  depsMock: MockRaidenEpicDeps,
): {
  token: Address;
  tokenNetwork: Address;
  partner: Address;
  target: Address;
  matrix: jest.Mocked<MatrixClient>;
  channelId: number;
  settleTimeout: number;
  isFirstParticipant: boolean;
  tokenContract: MockedContract<HumanStandardToken>;
  tokenNetworkContract: MockedContract<TokenNetwork>;
  accessToken: string;
  deviceId: string;
  displayName: string;
  partnerRoomId: string;
  partnerUserId: string;
  targetUserId: string;
  state: RaidenState;
  partnerSigner: Wallet;
  txHash: Hash;
  matrixServer: string;
  userId: string;
  processed: Processed;
  paymentId: UInt<8>;
  fee: Int<32>;
  paths: Paths;
  metadata: Metadata;
} {
  const wallet = new Wallet('0x3333333333333333333333333333333333333333333333333333333333333333'),
    token = '0x0000000000000000000000000000000000010001' as Address,
    tokenNetwork = '0x0000000000000000000000000000000000020001' as Address,
    partner = wallet.address as Address,
    target = '0x0100000000000000000000000000000000000005' as Address,
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
    partnerRoomId = `!partnerRoomId:${matrixServer}`,
    partnerUserId = `@${partner.toLowerCase()}:${matrixServer}`,
    targetUserId = `@${target.toLowerCase()}:${matrixServer}`,
    matrix = makeMatrix(userId, matrixServer),
    txHash = '0x0000000000000000000000000000000000000020111111111111111111111111' as Hash,
    processed: Processed = { type: MessageType.PROCESSED, message_identifier: makeMessageId() },
    paymentId = makePaymentId(),
    fee = bigNumberify(3) as Int<32>,
    paths = [{ path: [partner], fee }],
    metadata = { routes: [{ route: [partner] }] };

  depsMock.registryContract.functions.token_to_token_networks.mockImplementation(async _token =>
    _token === token ? tokenNetwork : AddressZero,
  );

  return {
    token,
    tokenNetwork,
    partner,
    target,
    matrix,
    channelId,
    settleTimeout,
    isFirstParticipant,
    tokenContract,
    tokenNetworkContract,
    accessToken,
    deviceId,
    displayName,
    partnerRoomId,
    partnerUserId,
    targetUserId,
    matrixServer,
    userId,
    txHash,
    state: {
      ...initialState,
      address: depsMock.address,
      blockNumber: 125,
    },
    partnerSigner: wallet,
    processed,
    paymentId,
    fee,
    paths,
    metadata,
  };
};
