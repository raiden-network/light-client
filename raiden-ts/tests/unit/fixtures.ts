/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { patchEthersDefineReadOnly } from './patches';
patchEthersDefineReadOnly();

import { first } from 'rxjs/operators';
import { Wallet } from 'ethers';
import { AddressZero } from 'ethers/constants';
import { bigNumberify } from 'ethers/utils';

import { Address, Hash, Int, Signature, Signed, UInt } from 'raiden-ts/utils/types';
import { Processed, MessageType } from 'raiden-ts/messages/types';
import { makeMessageId, makePaymentId } from 'raiden-ts/transfers/utils';

import { makeMatrix, MockRaidenEpicDeps } from './mocks';
import { IOU } from 'raiden-ts/path/types';
import { RaidenState } from 'raiden-ts/state';
import { pluckDistinct } from 'raiden-ts/utils/rx';

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
    },
    iou = {
      sender: depsMock.address,
      receiver: pfsAddress,
      one_to_n_address: '0x0A0000000000000000000000000000000000000a' as Address,
      chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
      expiration_block: bigNumberify(3232341) as UInt<32>,
      amount: bigNumberify(100) as UInt<32>,
      signature: '0x87ea2a9c6834513dcabfca011c4422eb02a824b8bbbfc8f555d6a6dd2ebbbe953e1a47ad27b9715d8c8cf2da833f7b7d6c8f9bdb997591b7234999901f042caf1b' as Signature,
    } as Signed<IOU>;

  let state!: RaidenState;
  depsMock.latest$.pipe(pluckDistinct('state'), first()).subscribe(s => (state = s));

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
    state,
    partnerSigner: wallet,
    processed,
    paymentId,
    fee,
    paths,
    metadata,
    pfsAddress,
    pfsTokenAddress,
    pfsInfoResponse,
    iou,
  };
}
