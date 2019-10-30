/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { patchEthersDefineReadOnly } from './patches';
patchEthersDefineReadOnly();

import { Wallet } from 'ethers';
import { AddressZero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';

import { Address, Hash, Int } from 'raiden-ts/utils/types';
import { Processed, MessageType } from 'raiden-ts/messages/types';
import { makeMessageId, makePaymentId } from 'raiden-ts/transfers/utils';

import { makeMatrix, MockRaidenEpicDeps } from './mocks';

/**
 * Composes several constants used across epics
 *
 * @param depsMock - RaidenEpicDeps mock object constructed through raidenEpicDeps
 * @returns Diverse constant values and objects
 */
export function epicFixtures(depsMock: MockRaidenEpicDeps) {
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
    metadata = { routes: [{ route: [partner] }] },
    pfsAddress = '0x0900000000000000000000000000000000000009' as Address,
    pfsTokenAddress = '0x0800000000000000000000000000000000000008' as Address,
    pfsInfoResponse = {
      message: 'pfs message',
      network_info: {
        chain_id: depsMock.network.chainId,
        registry_address: depsMock.contractsInfo.TokenNetworkRegistry.address,
      },
      operator: 'pfs operator',
      payment_address: pfsAddress,
      price_info: 2,
      version: '0.4.1',
    };

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
    state: depsMock.stateOutput$.value,
    partnerSigner: wallet,
    processed,
    paymentId,
    fee,
    paths,
    metadata,
    pfsAddress,
    pfsTokenAddress,
    pfsInfoResponse,
  };
}
